import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type AssignMembershipBody = {
  player_id?: unknown;
  team_id?: unknown;
  season_id?: unknown;
  member_role?: unknown;
};

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace členství není povolena." },
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

function membershipRole(value: unknown) {
  if (value === "captain") {
    return "captain";
  }

  if (value === "assistant_captain") {
    return "assistant_captain";
  }

  return "player";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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

  const [
    playersResult,
    teamsResult,
    seasonsResult,
    teamSeasonsResult,
    membershipsResult,
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),

    supabase
      .from("teams")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),

    supabase
      .from("seasons")
      .select("id, name, is_active, starts_on, ends_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false }),

    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name")
      .is("deleted_at", null),

    supabase
      .from("team_memberships")
      .select(
        "id, season_id, team_season_id, player_id, member_role, joined_on, left_on, created_at",
      )
      .is("deleted_at", null)
      .order("left_on", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false }),
  ]);

  const error =
    playersResult.error ??
    teamsResult.error ??
    seasonsResult.error ??
    teamSeasonsResult.error ??
    membershipsResult.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    players: playersResult.data ?? [],
    teams: teamsResult.data ?? [],
    seasons: seasonsResult.data ?? [],
    teamSeasons: teamSeasonsResult.data ?? [],
    memberships: membershipsResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as
    | AssignMembershipBody
    | null;

  const playerId = requiredString(body?.player_id);
  const teamId = requiredString(body?.team_id);
  const seasonId = requiredString(body?.season_id);
  const memberRole = membershipRole(body?.member_role);

  if (!playerId || !teamId || !seasonId) {
    return NextResponse.json(
      {
        error: "Vyberte hráče, tým a sezónu.",
      },
      { status: 400 },
    );
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data: existingTeamSeason, error: teamSeasonLookupError } =
    await supabase
      .from("team_seasons")
      .select("id, team_id, season_id")
      .eq("team_id", teamId)
      .eq("season_id", seasonId)
      .is("deleted_at", null)
      .maybeSingle();

  if (teamSeasonLookupError) {
    return NextResponse.json(
      { error: teamSeasonLookupError.message },
      { status: 500 },
    );
  }

  let teamSeasonId = existingTeamSeason?.id;

  if (!teamSeasonId) {
    const { data: createdTeamSeason, error: createTeamSeasonError } =
      await supabase
        .from("team_seasons")
        .insert({
          team_id: teamId,
          season_id: seasonId,
        })
        .select("id")
        .single();

    if (createTeamSeasonError) {
      return NextResponse.json(
        { error: createTeamSeasonError.message },
        { status: 500 },
      );
    }

    teamSeasonId = createdTeamSeason.id;
  }

  const { data: activeMemberships, error: activeMembershipsError } =
    await supabase
      .from("team_memberships")
      .select("id, team_season_id")
      .eq("player_id", playerId)
      .is("left_on", null)
      .is("deleted_at", null);

  if (activeMembershipsError) {
    return NextResponse.json(
      { error: activeMembershipsError.message },
      { status: 500 },
    );
  }

  const currentMembership = activeMemberships?.find(
    (membership) => membership.team_season_id === teamSeasonId,
  );

  if (currentMembership) {
    const { data: membership, error } = await supabase
      .from("team_memberships")
      .update({ member_role: memberRole })
      .eq("id", currentMembership.id)
      .select(
        "id, season_id, team_season_id, player_id, member_role, joined_on, left_on, created_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ membership });
  }

  if (activeMemberships && activeMemberships.length > 0) {
    const { error: closeMembershipsError } = await supabase
      .from("team_memberships")
      .update({ left_on: todayIsoDate() })
      .eq("player_id", playerId)
      .is("left_on", null)
      .is("deleted_at", null);

    if (closeMembershipsError) {
      return NextResponse.json(
        { error: closeMembershipsError.message },
        { status: 500 },
      );
    }
  }

  const { data: membership, error: createMembershipError } = await supabase
    .from("team_memberships")
    .insert({
      player_id: playerId,
      season_id: seasonId,
      team_season_id: teamSeasonId,
      member_role: memberRole,
      joined_on: todayIsoDate(),
    })
    .select(
      "id, season_id, team_season_id, player_id, member_role, joined_on, left_on, created_at",
    )
    .single();

  if (createMembershipError) {
    return NextResponse.json(
      { error: createMembershipError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ membership }, { status: 201 });
}
