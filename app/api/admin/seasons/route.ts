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
  copy_rosters?: unknown;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  display_name: string | null;
  home_venue: string | null;
  contact_email: string | null;
  is_active: boolean;
};

type MembershipRow = {
  player_id: string;
  member_role: string;
  team_season_id: string;
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

async function copyActiveSeasonRosters(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sourceSeasonId: string | null,
  targetSeasonId: string,
  joinedOn: string,
) {
  if (!sourceSeasonId || sourceSeasonId === targetSeasonId) {
    return { teams: 0, memberships: 0 };
  }

  const { data: sourceTeamSeasons, error: sourceTeamSeasonsError } = await supabase
    .from("team_seasons")
    .select("id, team_id, display_name, home_venue, contact_email, is_active")
    .eq("season_id", sourceSeasonId)
    .is("deleted_at", null)
    .returns<TeamSeasonRow[]>();

  if (sourceTeamSeasonsError) {
    throw new Error(sourceTeamSeasonsError.message);
  }

  const teamSeasonMap = new Map<string, string>();
  let copiedTeams = 0;

  for (const sourceTeamSeason of sourceTeamSeasons ?? []) {
    const { data: existingTarget, error: existingTargetError } = await supabase
      .from("team_seasons")
      .select("id")
      .eq("team_id", sourceTeamSeason.team_id)
      .eq("season_id", targetSeasonId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();

    if (existingTargetError) {
      throw new Error(existingTargetError.message);
    }

    if (existingTarget) {
      teamSeasonMap.set(sourceTeamSeason.id, existingTarget.id);
      continue;
    }

    const { data: createdTarget, error: createTargetError } = await supabase
      .from("team_seasons")
      .insert({
        team_id: sourceTeamSeason.team_id,
        season_id: targetSeasonId,
        display_name: sourceTeamSeason.display_name,
        home_venue: sourceTeamSeason.home_venue,
        contact_email: sourceTeamSeason.contact_email,
        is_active: sourceTeamSeason.is_active,
      })
      .select("id")
      .single<{ id: string }>();

    if (createTargetError) {
      throw new Error(createTargetError.message);
    }

    teamSeasonMap.set(sourceTeamSeason.id, createdTarget.id);
    copiedTeams += 1;
  }

  if (teamSeasonMap.size === 0) {
    return { teams: copiedTeams, memberships: 0 };
  }

  const { data: sourceMemberships, error: sourceMembershipsError } = await supabase
    .from("team_memberships")
    .select("player_id, member_role, team_season_id")
    .eq("season_id", sourceSeasonId)
    .in("team_season_id", Array.from(teamSeasonMap.keys()))
    .is("left_on", null)
    .is("deleted_at", null)
    .returns<MembershipRow[]>();

  if (sourceMembershipsError) {
    throw new Error(sourceMembershipsError.message);
  }

  let copiedMemberships = 0;

  for (const sourceMembership of sourceMemberships ?? []) {
    const targetTeamSeasonId = teamSeasonMap.get(sourceMembership.team_season_id);
    if (!targetTeamSeasonId) continue;

    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("season_id", targetSeasonId)
      .eq("player_id", sourceMembership.player_id)
      .is("left_on", null)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();

    if (existingMembershipError) {
      throw new Error(existingMembershipError.message);
    }

    if (existingMembership) {
      continue;
    }

    const { error: createMembershipError } = await supabase
      .from("team_memberships")
      .insert({
        season_id: targetSeasonId,
        team_season_id: targetTeamSeasonId,
        player_id: sourceMembership.player_id,
        member_role: sourceMembership.member_role,
        joined_on: joinedOn,
      });

    if (createMembershipError) {
      throw new Error(createMembershipError.message);
    }

    copiedMemberships += 1;
  }

  return { teams: copiedTeams, memberships: copiedMemberships };
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
  const copyRosters = body?.copy_rosters === true;

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

  const { data: activeSeasonBeforeCreate, error: activeSeasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (activeSeasonError) {
    return NextResponse.json({ error: activeSeasonError.message }, { status: 500 });
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

  try {
    const copiedRosters = copyRosters
      ? await copyActiveSeasonRosters(supabase, activeSeasonBeforeCreate?.id ?? null, data.id, startsOn)
      : { teams: 0, memberships: 0 };

    return NextResponse.json({ season: data, copied_rosters: copiedRosters }, { status: 201 });
  } catch (copyError) {
    return NextResponse.json(
      {
        error: copyError instanceof Error
          ? `Sezóna byla vytvořena, ale soupisky se nepodařilo zkopírovat: ${copyError.message}`
          : "Sezóna byla vytvořena, ale soupisky se nepodařilo zkopírovat.",
      },
      { status: 500 },
    );
  }
}
