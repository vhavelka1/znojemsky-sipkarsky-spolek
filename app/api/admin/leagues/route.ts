import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreateLeagueBody = {
  action?: "create_league";
  name?: unknown;
  season_id?: unknown;
};

type CreateGroupBody = {
  action?: "create_group";
  league_id?: unknown;
  name?: unknown;
};

type AssignTeamBody = {
  action?: "assign_team";
  league_group_id?: unknown;
  team_season_id?: unknown;
};

type LeagueRequestBody = CreateLeagueBody | CreateGroupBody | AssignTeamBody;

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

export async function GET() {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const [seasons, teams, teamSeasons, leagues, groups, assignments] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name")
      .is("deleted_at", null),
    supabase
      .from("leagues")
      .select("id, season_id, name, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("league_groups")
      .select("id, league_id, name, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("league_group_teams")
      .select("id, league_group_id, team_season_id")
      .is("deleted_at", null),
  ]);

  const error =
    seasons.error ??
    teams.error ??
    teamSeasons.error ??
    leagues.error ??
    groups.error ??
    assignments.error;

  if (error) {
    if (
      error.message.includes("public.leagues") ||
      error.message.includes("schema cache")
    ) {
      return NextResponse.json(
        {
          error:
            "Tabulky pro ligy zatím nejsou vytvořené. Spusťte SQL soubor supabase/apply_leagues_in_dashboard.sql v Supabase SQL Editoru.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    seasons: seasons.data ?? [],
    teams: teams.data ?? [],
    teamSeasons: teamSeasons.data ?? [],
    leagues: leagues.data ?? [],
    groups: groups.data ?? [],
    assignments: assignments.data ?? [],
  });
}

export async function POST(request: Request) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as LeagueRequestBody | null;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  if (body?.action === "create_league") {
    const name = requiredString(body.name);
    const seasonId = requiredString(body.season_id);

    if (!name || !seasonId) {
      return NextResponse.json({ error: "name and season_id are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("leagues")
      .insert({ name, season_id: seasonId })
      .select("id, season_id, name, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ league: data }, { status: 201 });
  }

  if (body?.action === "create_group") {
    const name = requiredString(body.name);
    const leagueId = requiredString(body.league_id);

    if (!name || !leagueId) {
      return NextResponse.json({ error: "name and league_id are required." }, { status: 400 });
    }

    const { count, error: countError } = await supabase
      .from("league_groups")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .is("deleted_at", null);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("league_groups")
      .insert({ name, league_id: leagueId, sort_order: count ?? 0 })
      .select("id, league_id, name, sort_order")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group: data }, { status: 201 });
  }

  if (body?.action === "assign_team") {
    const leagueGroupId = requiredString(body.league_group_id);
    const teamSeasonId = requiredString(body.team_season_id);

    if (!leagueGroupId || !teamSeasonId) {
      return NextResponse.json(
        { error: "league_group_id and team_season_id are required." },
        { status: 400 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("league_groups")
      .select("id, leagues(season_id)")
      .eq("id", leagueGroupId)
      .is("deleted_at", null)
      .single();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 });
    }

    const { data: teamSeason, error: teamSeasonError } = await supabase
      .from("team_seasons")
      .select("id, season_id")
      .eq("id", teamSeasonId)
      .is("deleted_at", null)
      .single();

    if (teamSeasonError) {
      return NextResponse.json({ error: teamSeasonError.message }, { status: 500 });
    }

    const groupLeague = Array.isArray(group.leagues) ? group.leagues[0] : group.leagues;

    if (!groupLeague || groupLeague.season_id !== teamSeason.season_id) {
      return NextResponse.json(
        { error: "Team season must belong to the league season." },
        { status: 400 },
      );
    }

    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from("league_group_teams")
      .select("id, league_group_id, team_season_id")
      .eq("league_group_id", leagueGroupId)
      .eq("team_season_id", teamSeasonId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingAssignmentError) {
      return NextResponse.json({ error: existingAssignmentError.message }, { status: 500 });
    }

    if (existingAssignment) {
      return NextResponse.json({ assignment: existingAssignment });
    }

    const { data, error } = await supabase
      .from("league_group_teams")
      .insert({
        league_group_id: leagueGroupId,
        team_season_id: teamSeasonId,
      })
      .select("id, league_group_id, team_season_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
