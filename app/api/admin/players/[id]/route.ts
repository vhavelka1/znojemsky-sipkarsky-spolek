import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdatePlayerBody = {
  display_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  date_of_birth?: unknown;
  residence?: unknown;
  email?: unknown;
  phone?: unknown;
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

export async function PATCH(request: Request, context: RouteContext) {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  const adminResponse = mockAdminResponse();
  if (adminResponse) {
    return adminResponse;
  }

  const body = (await request.json().catch(() => null)) as UpdatePlayerBody | null;
  const displayName = optionalString(body?.display_name);

  if (!displayName) {
    return NextResponse.json(
      { error: "Zobrazované jméno je povinné." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("players")
    .update({
      display_name: displayName,
      first_name: optionalString(body?.first_name),
      last_name: optionalString(body?.last_name),
      date_of_birth: optionalDate(body?.date_of_birth),
      residence: optionalString(body?.residence),
      email: optionalEmail(body?.email),
      phone: optionalString(body?.phone),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, display_name, first_name, last_name, date_of_birth, residence, email, phone, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player: data });
}
