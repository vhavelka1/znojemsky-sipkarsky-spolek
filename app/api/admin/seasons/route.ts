import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreateSeasonBody = {
  name?: unknown;
  starts_on?: unknown;
  ends_on?: unknown;
  transfer_deadline_on?: unknown;
  transfer_wait_days?: unknown;
  is_active?: unknown;
};

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace sezón není povolena." },
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

function requiredString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseTransferWaitDays(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function validateDates(
  startsOn: string,
  endsOn: string,
  transferDeadlineOn: string,
) {
  if (startsOn >= endsOn) {
    return "Začátek sezóny musí být před koncem sezóny.";
  }

  if (transferDeadlineOn < startsOn || transferDeadlineOn > endsOn) {
    return "Uzávěrka přestupů musí být v rozmezí sezóny.";
  }

  return null;
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

function guardRequest() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  return mockAdminResponse();
}

export async function GET() {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("seasons")
    .select(
      "id, name, starts_on, ends_on, transfer_deadline_on, transfer_wait_days, is_active, created_at, updated_at, deleted_at",
    )
    .is("deleted_at", null)
    .order("starts_on", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seasons: data ?? [] });
}

export async function POST(request: Request) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as CreateSeasonBody | null;
  const name = requiredString(body?.name);
  const startsOn = requiredString(body?.starts_on);
  const endsOn = requiredString(body?.ends_on);
  const transferDeadlineOn = requiredString(body?.transfer_deadline_on);
  const transferWaitDays = parseTransferWaitDays(body?.transfer_wait_days);

  if (
    !name ||
    !startsOn ||
    !endsOn ||
    !transferDeadlineOn ||
    transferWaitDays === null
  ) {
    return NextResponse.json(
      {
        error:
          "Vyplňte název, začátek, konec, uzávěrku přestupů a čekací dobu přestupu.",
      },
      { status: 400 },
    );
  }

  const dateError = validateDates(startsOn, endsOn, transferDeadlineOn);
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  if (body?.is_active === true) {
    const { error: deactivateError } = await supabase
      .from("seasons")
      .update({ is_active: false })
      .eq("is_active", true)
      .is("deleted_at", null);

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("seasons")
    .insert({
      name,
      starts_on: startsOn,
      ends_on: endsOn,
      transfer_deadline_on: transferDeadlineOn,
      transfer_wait_days: transferWaitDays,
      is_active: body?.is_active === true,
    })
    .select(
      "id, name, starts_on, ends_on, transfer_deadline_on, transfer_wait_days, is_active, created_at, updated_at, deleted_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ season: data }, { status: 201 });
}