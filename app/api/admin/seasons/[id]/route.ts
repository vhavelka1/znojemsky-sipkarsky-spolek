import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type UpdateSeasonBody = {
  name?: unknown;
  starts_on?: unknown;
  ends_on?: unknown;
  transfer_deadline_on?: unknown;
  transfer_wait_days?: unknown;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function developmentOnlyResponse() {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  return NextResponse.json(
    { error: "Development-only admin API route." },
    { status: 404 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json({ error: "Admin role required." }, { status: 403 });
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

function validateDates(startsOn: string, endsOn: string, transferDeadlineOn: string) {
  if (startsOn >= endsOn) {
    return "Season start date must be before end date.";
  }

  if (transferDeadlineOn < startsOn || transferDeadlineOn > endsOn) {
    return "Transfer deadline must be within season dates.";
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
        { error: error instanceof Error ? error.message : "Server configuration error." },
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

export async function PATCH(request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as UpdateSeasonBody | null;
  const name = requiredString(body?.name);
  const startsOn = requiredString(body?.starts_on);
  const endsOn = requiredString(body?.ends_on);
  const transferDeadlineOn = requiredString(body?.transfer_deadline_on);
  const transferWaitDays = parseTransferWaitDays(body?.transfer_wait_days);

  if (!name || !startsOn || !endsOn || !transferDeadlineOn || transferWaitDays === null) {
    return NextResponse.json(
      { error: "name, starts_on, ends_on, transfer_deadline_on and transfer_wait_days are required." },
      { status: 400 },
    );
  }

  const dateError = validateDates(startsOn, endsOn, transferDeadlineOn);
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("seasons")
    .update({
      name,
      starts_on: startsOn,
      ends_on: endsOn,
      transfer_deadline_on: transferDeadlineOn,
      transfer_wait_days: transferWaitDays,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, starts_on, ends_on, transfer_deadline_on, transfer_wait_days, is_active, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ season: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("seasons")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, starts_on, ends_on, transfer_deadline_on, transfer_wait_days, is_active, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ season: data });
}
