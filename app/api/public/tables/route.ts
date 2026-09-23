import { NextRequest, NextResponse } from "next/server";
import { buildLeagueGroupStandings, isFinishedMatch, type MatchStatus } from "@/lib/leagueStandings";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type League = {
  id: string;
  season_id: string;
  name: string;
};

type LeagueGroup = {
  id: string;
  league_id: string;
  name: string;
  sort_order: number;
};

type Team = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type LeagueGroupTeam = {
  league_group_id: string;
  team_season_id: string;
};

type Match = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  played_at: string | null;
  status: MatchStatus;
};

type MatchResult = {
  match_id: string;
  home_points: number;
  away_points: number;
};

type MatchGame = {
  match_id: string;
  home_legs: number;
  away_legs: number;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const [
      seasons,
      leagues,
      groups,
      teamSeasons,
      assignments,
      teamsWithLogos,
      matches,
      results,
    ] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, is_active, starts_on")
        .is("deleted_at", null)
        .order("starts_on", { ascending: false })
        .returns<Season[]>(),
      supabase
        .from("leagues")
        .select("id, season_id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<League[]>(),
      supabase
        .from("league_groups")
        .select("id, league_id, name, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .returns<LeagueGroup[]>(),
      supabase
        .from("team_seasons")
        .select("id, team_id, season_id, display_name")
        .is("deleted_at", null)
        .returns<TeamSeason[]>(),
      supabase
        .from("league_group_teams")
        .select("league_group_id, team_season_id")
        .is("deleted_at", null)
        .returns<LeagueGroupTeam[]>(),
      supabase
        .from("teams")
        .select("id, name, slug, logo_url")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .is("deleted_at", null)
        .returns<Match[]>(),
      supabase
        .from("match_results")
        .select("match_id, home_points, away_points")
        .is("deleted_at", null)
        .returns<MatchResult[]>(),
    ]);

    let teams = teamsWithLogos.data as Team[] | null;
    let teamsError = teamsWithLogos.error;
    if (teamsError?.message.includes("logo_url")) {
      const fallback = await supabase
        .from("teams")
        .select("id, name, slug")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<Team[]>();
      teams = fallback.data;
      teamsError = fallback.error;
    }

    const error =
      seasons.error ??
      leagues.error ??
      groups.error ??
      teamSeasons.error ??
      assignments.error ??
      teamsError ??
      matches.error ??
      results.error;

    if (error) {
      return NextResponse.json(
        { error: "Veřejné tabulky se nepodařilo načíst." },
        { status: 500 },
      );
    }

    const activeSeason =
      (seasons.data ?? []).find((season) => season.is_active) ?? seasons.data?.[0] ?? null;
    const selectedSeasonId = request.nextUrl.searchParams.get("season_id") || activeSeason?.id || "";
    const selectedLeague =
      (leagues.data ?? []).find(
        (league) =>
          league.id === request.nextUrl.searchParams.get("league_id") &&
          league.season_id === selectedSeasonId,
      ) ??
      (leagues.data ?? []).find((league) => league.season_id === selectedSeasonId) ??
      null;
    const selectedGroup =
      (groups.data ?? []).find(
        (group) =>
          group.id === request.nextUrl.searchParams.get("group_id") &&
          group.league_id === selectedLeague?.id,
      ) ??
      (groups.data ?? []).find((group) => group.league_id === selectedLeague?.id) ??
      null;

    const teamRows = (teams ?? []).map((team) => ({
      ...team,
      logo_url: teamLogoUrl(team.slug, team.logo_url),
    }));
    const resultByMatchId = new Map((results.data ?? []).map((result) => [result.match_id, result]));

    const matchIdsForLegs = (matches.data ?? [])
      .filter(
        (match) =>
          isFinishedMatch(match) &&
          match.season_id === selectedSeasonId &&
          match.league_id === selectedLeague?.id &&
          match.group_id === selectedGroup?.id &&
          resultByMatchId.has(match.id),
      )
      .map((match) => match.id);

    let matchGames: MatchGame[] = [];
    if (matchIdsForLegs.length > 0) {
      const gamesResult = await supabase
        .from("match_games")
        .select("match_id, home_legs, away_legs")
        .in("match_id", matchIdsForLegs)
        .is("deleted_at", null)
        .returns<MatchGame[]>();

      matchGames = gamesResult.error ? [] : gamesResult.data ?? [];
    }

    const standings = selectedGroup
      ? buildLeagueGroupStandings({
          assignments: assignments.data ?? [],
          groupId: selectedGroup.id,
          matches: (matches.data ?? []).filter(
            (match) =>
              match.season_id === selectedSeasonId &&
              match.league_id === selectedLeague?.id,
          ),
          matchGames,
          results: results.data ?? [],
          teams: teamRows,
          teamSeasons: teamSeasons.data ?? [],
        })
      : [];

    return NextResponse.json({
      seasons: seasons.data ?? [],
      leagues: leagues.data ?? [],
      groups: groups.data ?? [],
      selected: {
        seasonId: selectedSeasonId,
        leagueId: selectedLeague?.id ?? "",
        groupId: selectedGroup?.id ?? "",
      },
      standings,
    });
  } catch {
    return NextResponse.json(
      { error: "Veřejné tabulky se nepodařilo načíst." },
      { status: 500 },
    );
  }
}
