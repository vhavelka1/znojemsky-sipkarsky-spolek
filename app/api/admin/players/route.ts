import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreatePlayerBody = {
  display_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  date_of_birth?: unknown;
  residence?: unknown;
  email?: unknown;
  phone?: unknown;
};

type PlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  residence: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace hráčů není povolena." },
    { status: 403 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json(
    { error: "Pro tuto akci je potřeba role administrátora." },
    { status: 403 },
  );
}

function optionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalEmail(value: unknown) {
  const email = optionalString(value);
  return email ? email.toLowerCase() : null;
}

function optionalDate(value: unknown) {
  const date = optionalString(value);
  if (!date) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nepodařilo se načíst serverové nastavení.",
        },
        { status: 500 },
      ),
    };
  }
}

export async function GET() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  const adminResponse = mockAdminResponse();
  if (adminResponse) {
    return adminResponse;
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const [playersResult, membershipsResult] = await Promise.all([
    supabase
    .from("players")
    .select("id, display_name, first_name, last_name, date_of_birth, residence, email, phone, created_at")
    .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .returns<PlayerRow[]>(),
    supabase
      .from("team_memberships")
      .select("player_id")
      .is("deleted_at", null)
      .returns<Array<{ player_id: string }>>(),
  ]);

  const error = playersResult.error ?? membershipsResult.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const membershipCounts = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
    membershipCounts.set(membership.player_id, (membershipCounts.get(membership.player_id) ?? 0) + 1);
  }

  const players = (playersResult.data ?? []).map((player) => ({
    ...player,
    roster_membership_count: membershipCounts.get(player.id) ?? 0,
  }));

  return NextResponse.json({ players });
}

export async function POST(request: Request) {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  const adminResponse = mockAdminResponse();
  if (adminResponse) {
    return adminResponse;
  }

  const body = (await request.json().catch(() => null)) as CreatePlayerBody | null;
  const displayName = optionalString(body?.display_name);

  if (!displayName) {
    return NextResponse.json(
      { error: "Zobrazované jméno je povinné." },
      { status: 400 },
    );
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("players")
    .insert({
      display_name: displayName,
      first_name: optionalString(body?.first_name),
      last_name: optionalString(body?.last_name),
      date_of_birth: optionalDate(body?.date_of_birth),
      residence: optionalString(body?.residence),
      email: optionalEmail(body?.email),
      phone: optionalString(body?.phone),
    })
    .select("id, display_name, first_name, last_name, date_of_birth, residence, email, phone, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player: data }, { status: 201 });
}
