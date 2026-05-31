import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreatePlayerBody = {
  display_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  nickname?: unknown;
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

  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, first_name, last_name, nickname, created_at")
    .is("deleted_at", null)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ players: data ?? [] });
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
      nickname: optionalString(body?.nickname),
    })
    .select("id, display_name, first_name, last_name, nickname, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player: data }, { status: 201 });
}