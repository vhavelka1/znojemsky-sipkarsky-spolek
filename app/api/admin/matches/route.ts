import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreateMatchBody = {
  action?: "create_match";
  season_id?: unknown;
  league_id?: unknown;
  group_id?: unknown;
  home_team_id?: unknown;
  away_team_id?: unknown;
  scheduled_at?: unknown;
};

type SaveResultBody = {
  action?: "save_result";
  match_id?: unknown;
  home_points?: unknown;
  away_points?: unknown;
};

type PrepareMatchSetupBody = {
  action?: "prepare_match_setup";
  season_id?: unknown;
  league_id?: unknown;
};

type MatchRequestBody =
  | CreateMatchBody
  | SaveResultBody
  | PrepareMatchSetupBody;

type LeagueGroup = {
  id: string;
  league_id: string;
};

type League = {
  id: string;
  season_id: string;
};

type TeamSeason = {
  id: string;
  season_id: string;
};

type ExistingTeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
};

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace zápasů není povolena." },
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

function requiredNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
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

function missingMatchesSchemaResponse(errorMessage: string) {
  if (
    errorMessage.includes("public.matches") ||
    errorMessage.includes("public.match_results") ||
    errorMessage.includes("schema cache")
  ) {
    return NextResponse.json(
      {
        error:
          "Tabulky pro zápasy zatím nejsou vytvořené. Spusťte SQL soubor supabase/apply_matches_in_dashboard.sql v Supabase SQL Editoru.",
      },
      { status: 500 },
    );
  }

  return null;
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
    seasons,
    leagues,
    groups,
    teams,
    teamSeasons,
    assignments,
    matches,
    results,
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false }),
    supabase
      .from("leagues")
      .select("id, season_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("league_groups")
      .select("id, league_id, name, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
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
      .from("league_group_teams")
      .select("id, league_group_id, team_season_id")
      .is("deleted_at", null),
    supabase
      .from("matches")
      .select(
        "id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status, created_at",
      )
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("match_results")
      .select("id, match_id, home_points, away_points")
      .is("deleted_at", null),
  ]);

  const error =
    seasons.error ??
    leagues.error ??
    groups.error ??
    teams.error ??
    teamSeasons.error ??
    assignments.error ??
    matches.error ??
    results.error;

  if (error) {
    const schemaResponse = missingMatchesSchemaResponse(error.message);
    if (schemaResponse) {
      return schemaResponse;
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    seasons: seasons.data ?? [],
    leagues: leagues.data ?? [],
    groups: groups.data ?? [],
    teams: teams.data ?? [],
    teamSeasons: teamSeasons.data ?? [],
    assignments: assignments.data ?? [],
    matches: matches.data ?? [],
    results: results.data ?? [],
  });
}

export async function POST(request: Request) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as MatchRequestBody | null;
  const { supabase, response } = getAdminClientOrError();

  if (response) {
    return response;
  }

  if (body?.action === "create_match") {
    const seasonId = requiredString(body.season_id);
    const leagueId = requiredString(body.league_id);
    const groupId = requiredString(body.group_id);
    const homeTeamId = requiredString(body.home_team_id);
    const awayTeamId = requiredString(body.away_team_id);
    const scheduledAt = requiredString(body.scheduled_at);

    if (!seasonId || !leagueId || !groupId || !homeTeamId || !awayTeamId || !scheduledAt) {
      return NextResponse.json(
        { error: "Vyplňte všechna pole zápasu." },
        { status: 400 },
      );
    }

    if (homeTeamId === awayTeamId) {
      return NextResponse.json(
        { error: "Tým nemůže hrát sám proti sobě." },
        { status: 400 },
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: "Zadejte platné datum a čas zápasu." },
        { status: 400 },
      );
    }

    const [leagueResult, groupResult, teamSeasonsResult, assignmentsResult] =
      await Promise.all([
        supabase
          .from("leagues")
          .select("id, season_id")
          .eq("id", leagueId)
          .is("deleted_at", null)
          .single<League>(),
        supabase
          .from("league_groups")
          .select("id, league_id")
          .eq("id", groupId)
          .is("deleted_at", null)
          .single<LeagueGroup>(),
        supabase
          .from("team_seasons")
          .select("id, season_id")
          .in("id", [homeTeamId, awayTeamId])
          .is("deleted_at", null)
          .returns<TeamSeason[]>(),
        supabase
          .from("league_group_teams")
          .select("team_season_id")
          .eq("league_group_id", groupId)
          .in("team_season_id", [homeTeamId, awayTeamId])
          .is("deleted_at", null),
      ]);

    const validationError =
      leagueResult.error ??
      groupResult.error ??
      teamSeasonsResult.error ??
      assignmentsResult.error;

    if (validationError) {
      return NextResponse.json({ error: validationError.message }, { status: 500 });
    }

    if (!leagueResult.data || !groupResult.data) {
      return NextResponse.json(
        { error: "Vybraná liga nebo skupina nebyla nalezena." },
        { status: 400 },
      );
    }

    if (leagueResult.data.season_id !== seasonId) {
      return NextResponse.json(
        { error: "Vybraná liga nepatří do zvolené sezóny." },
        { status: 400 },
      );
    }

    if (groupResult.data.league_id !== leagueId) {
      return NextResponse.json(
        { error: "Vybraná skupina nepatří do zvolené ligy." },
        { status: 400 },
      );
    }

    const selectedTeamSeasons = teamSeasonsResult.data ?? [];

    if (
      selectedTeamSeasons.length !== 2 ||
      selectedTeamSeasons.some((teamSeason) => teamSeason.season_id !== seasonId)
    ) {
      return NextResponse.json(
        { error: "Oba týmy musí patřit do zvolené sezóny." },
        { status: 400 },
      );
    }

    if ((assignmentsResult.data ?? []).length !== 2) {
      return NextResponse.json(
        { error: "Oba týmy musí být přiřazené do vybrané skupiny." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("matches")
      .insert({
        season_id: seasonId,
        league_id: leagueId,
        group_id: groupId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        scheduled_at: scheduledDate.toISOString(),
        status: "scheduled",
      })
      .select(
        "id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status, created_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ match: data }, { status: 201 });
  }

  if (body?.action === "prepare_match_setup") {
    const seasonId = requiredString(body.season_id);
    const leagueId = requiredString(body.league_id);

    if (!seasonId || !leagueId) {
      return NextResponse.json(
        { error: "Vyberte sezónu a ligu." },
        { status: 400 },
      );
    }

    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .select("id, season_id")
      .eq("id", leagueId)
      .is("deleted_at", null)
      .single<League>();

    if (leagueError || !league) {
      return NextResponse.json(
        { error: leagueError?.message ?? "Liga nebyla nalezena." },
        { status: 500 },
      );
    }

    if (league.season_id !== seasonId) {
      return NextResponse.json(
        { error: "Vybraná liga nepatří do zvolené sezóny." },
        { status: 400 },
      );
    }

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .is("deleted_at", null);

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    if (!teams || teams.length === 0) {
      return NextResponse.json(
        { error: "Nejdřív vytvořte alespoň jeden tým." },
        { status: 400 },
      );
    }

    const { data: existingGroup, error: groupLookupError } = await supabase
      .from("league_groups")
      .select("id, league_id, name, sort_order")
      .eq("league_id", leagueId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (groupLookupError) {
      return NextResponse.json({ error: groupLookupError.message }, { status: 500 });
    }

    let groupId = existingGroup?.id ?? null;

    if (!groupId) {
      const { data: createdGroup, error: createGroupError } = await supabase
        .from("league_groups")
        .insert({ league_id: leagueId, name: "Skupina A", sort_order: 0 })
        .select("id")
        .single();

      if (createGroupError) {
        return NextResponse.json({ error: createGroupError.message }, { status: 500 });
      }

      groupId = createdGroup.id;
    }

    const { data: existingTeamSeasons, error: teamSeasonLookupError } = await supabase
      .from("team_seasons")
      .select("id, team_id, season_id")
      .eq("season_id", seasonId)
      .is("deleted_at", null)
      .returns<ExistingTeamSeason[]>();

    if (teamSeasonLookupError) {
      return NextResponse.json({ error: teamSeasonLookupError.message }, { status: 500 });
    }

    const existingTeamSeasonByTeamId = new Map(
      (existingTeamSeasons ?? []).map((teamSeason) => [teamSeason.team_id, teamSeason]),
    );

    const missingTeams = teams.filter((team) => !existingTeamSeasonByTeamId.has(team.id));

    let createdTeamSeasons: ExistingTeamSeason[] = [];

    if (missingTeams.length > 0) {
      const { data, error } = await supabase
        .from("team_seasons")
        .insert(
          missingTeams.map((team) => ({
            team_id: team.id,
            season_id: seasonId,
          })),
        )
        .select("id, team_id, season_id")
        .returns<ExistingTeamSeason[]>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      createdTeamSeasons = data ?? [];
    }

    const allTeamSeasons = [...(existingTeamSeasons ?? []), ...createdTeamSeasons];

    const { data: existingAssignments, error: assignmentsLookupError } = await supabase
      .from("league_group_teams")
      .select("team_season_id")
      .eq("league_group_id", groupId)
      .is("deleted_at", null);

    if (assignmentsLookupError) {
      return NextResponse.json({ error: assignmentsLookupError.message }, { status: 500 });
    }

    const assignedTeamSeasonIds = new Set(
      (existingAssignments ?? []).map((assignment) => assignment.team_season_id),
    );

    const missingAssignments = allTeamSeasons.filter(
      (teamSeason) => !assignedTeamSeasonIds.has(teamSeason.id),
    );

    if (missingAssignments.length > 0) {
      const { error } = await supabase.from("league_group_teams").insert(
        missingAssignments.map((teamSeason) => ({
          league_group_id: groupId,
          team_season_id: teamSeason.id,
        })),
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      group_id: groupId,
      team_seasons_count: allTeamSeasons.length,
    });
  }

  if (body?.action === "save_result") {
    const matchId = requiredString(body.match_id);
    const homePoints = requiredNumber(body.home_points);
    const awayPoints = requiredNumber(body.away_points);

    if (!matchId || homePoints === null || awayPoints === null) {
      return NextResponse.json(
        { error: "Vyplňte platný výsledek zápasu." },
        { status: 400 },
      );
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("id", matchId)
      .is("deleted_at", null)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { error: matchError?.message ?? "Zápas nebyl nalezen." },
        { status: 500 },
      );
    }

    const { data: existingResult, error: existingResultError } = await supabase
      .from("match_results")
      .select("id")
      .eq("match_id", matchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingResultError) {
      return NextResponse.json({ error: existingResultError.message }, { status: 500 });
    }

    const resultQuery = existingResult
      ? supabase
          .from("match_results")
          .update({ home_points: homePoints, away_points: awayPoints })
          .eq("id", existingResult.id)
          .select("id, match_id, home_points, away_points")
          .single()
      : supabase
          .from("match_results")
          .insert({
            match_id: matchId,
            home_points: homePoints,
            away_points: awayPoints,
          })
          .select("id, match_id, home_points, away_points")
          .single();

    const { data, error } = await resultQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: matchUpdateError } = await supabase
      .from("matches")
      .update({
        status: "awaiting_confirmation",
        played_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (matchUpdateError) {
      return NextResponse.json({ error: matchUpdateError.message }, { status: 500 });
    }

    const { error: confirmationsDeleteError } = await supabase
      .from("match_confirmations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("match_id", matchId)
      .is("deleted_at", null);

    if (confirmationsDeleteError) {
      return NextResponse.json(
        { error: confirmationsDeleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ result: data });
  }

  return NextResponse.json({ error: "Nepodporovaná akce." }, { status: 400 });
}