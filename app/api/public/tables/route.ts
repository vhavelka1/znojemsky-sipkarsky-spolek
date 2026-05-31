import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

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

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";

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

type StandingRow = {
  teamSeasonId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  overtimeWins: number;
  overtimeLosses: number;
  losses: number;
  matchScoreFor: number;
  matchScoreAgainst: number;
  matchScoreDiff: number;
  legScoreFor: number;
  legScoreAgainst: number;
  legScoreDiff: number;
  points: number;
};

const bundledLogoUrls: Record<string, string> = {
  "aligatori-kucharovice": "/team-logos/aligatori.png",
  "beny-club": "/team-logos/beny-club.png",
  "dc-dikobrazi-olbramovice": "/team-logos/dc-dikobrazi-olbramovice.png",
  "dc-draci-resice": "/team-logos/dc-draci-resice.png",
  "dc-fretky-rosice": "/team-logos/dc-fretky-rosice.png",
  "dc-jezci-moravsky-krumlov": "/team-logos/dc-jezci-mor-krumlov.png",
  "dc-kohouti-mackovice": "/team-logos/dc-kohouti-mackovice.png",
  "dc-krakeni-hrusovany-nad-jevisovkou": "/team-logos/dc-krakeni.png",
  "dc-medvedi-chvalovice": "/team-logos/dc-medvedi-chvalovice.png",
  "dc-orli": "/team-logos/dc-orli.png",
  "dc-rafani-hodonice": "/team-logos/dc-rafani-hodonice.png",
  "dc-rytiri": "/team-logos/dc-rytiri.png",
  "dc-sklipkani-sanov": "/team-logos/dc-sklipkani-sanov.png",
  "dc-sloni-ivancice": "/team-logos/dc-sloni-ivancice.png",
  "dc-srsni-vemyslice": "/team-logos/dc-srsni-vemyslice.png",
  "dc-vlci": "/team-logos/dc-vlci.png",
  "loofci-moravske-budejovice": "/team-logos/loofci-mor-budejovice.png",
  "lukovsti-dravci": "/team-logos/lukovsti-dravci.png",
  "octopus-kridluvky": "/team-logos/oktopus-kridluvky.png",
};

function isFinishedMatch(match: Match) {
  return (
    match.status === "played" ||
    match.status === "confirmed" ||
    match.status === "awaiting_confirmation"
  );
}

function compareStandingRows(first: StandingRow, second: StandingRow) {
  const pointsDiff = second.points - first.points;
  if (pointsDiff !== 0) return pointsDiff;

  const matchDiff = second.matchScoreDiff - first.matchScoreDiff;
  if (matchDiff !== 0) return matchDiff;

  const matchScoreForDiff = second.matchScoreFor - first.matchScoreFor;
  if (matchScoreForDiff !== 0) return matchScoreForDiff;

  const legDiff = second.legScoreDiff - first.legScoreDiff;
  if (legDiff !== 0) return legDiff;

  return first.teamName.localeCompare(second.teamName, "cs");
}

function createEmptyRow(teamSeasonId: string, teamName: string, logoUrl: string | null): StandingRow {
  return {
    teamSeasonId,
    teamName,
    logoUrl,
    played: 0,
    wins: 0,
    overtimeWins: 0,
    overtimeLosses: 0,
    losses: 0,
    matchScoreFor: 0,
    matchScoreAgainst: 0,
    matchScoreDiff: 0,
    legScoreFor: 0,
    legScoreAgainst: 0,
    legScoreDiff: 0,
    points: 0,
  };
}

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
      logo_url: team.logo_url ?? bundledLogoUrls[team.slug] ?? null,
    }));
    const teamById = new Map(teamRows.map((team) => [team.id, team]));
    const teamSeasonById = new Map((teamSeasons.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
    const resultByMatchId = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const selectedGroupTeamSeasonIds = new Set(
      (assignments.data ?? [])
        .filter((assignment) => assignment.league_group_id === selectedGroup?.id)
        .map((assignment) => assignment.team_season_id),
    );

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

    const legScoreByMatchId = new Map<string, { home: number; away: number }>();
    matchGames.forEach((game) => {
      const current = legScoreByMatchId.get(game.match_id) ?? { home: 0, away: 0 };
      current.home += game.home_legs;
      current.away += game.away_legs;
      legScoreByMatchId.set(game.match_id, current);
    });

    const teamSeasonLabel = (teamSeasonId: string) => {
      const teamSeason = teamSeasonById.get(teamSeasonId);
      const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
      return {
        name: teamSeason?.display_name || team?.name || "Neznámý tým",
        logoUrl: team?.logo_url ?? null,
      };
    };

    const rows = new Map<string, StandingRow>();
    selectedGroupTeamSeasonIds.forEach((teamSeasonId) => {
      const team = teamSeasonLabel(teamSeasonId);
      rows.set(teamSeasonId, createEmptyRow(teamSeasonId, team.name, team.logoUrl));
    });

    (matches.data ?? [])
      .filter(
        (match) =>
          isFinishedMatch(match) &&
          match.season_id === selectedSeasonId &&
          match.league_id === selectedLeague?.id &&
          match.group_id === selectedGroup?.id,
      )
      .forEach((match) => {
        const result = resultByMatchId.get(match.id);
        const home = rows.get(match.home_team_id);
        const away = rows.get(match.away_team_id);
        if (!result || !home || !away) return;

        const legs = legScoreByMatchId.get(match.id) ?? { home: 0, away: 0 };
        home.played += 1;
        away.played += 1;
        home.matchScoreFor += result.home_points;
        home.matchScoreAgainst += result.away_points;
        away.matchScoreFor += result.away_points;
        away.matchScoreAgainst += result.home_points;
        home.legScoreFor += legs.home;
        home.legScoreAgainst += legs.away;
        away.legScoreFor += legs.away;
        away.legScoreAgainst += legs.home;

        // TODO: Replace this with explicit tiebreak/overtime metadata once match_results stores it.
        if (result.home_points > result.away_points) {
          home.wins += 1;
          home.points += 3;
          away.losses += 1;
        } else if (result.home_points < result.away_points) {
          away.wins += 1;
          away.points += 3;
          home.losses += 1;
        } else {
          home.points += 1;
          away.points += 1;
        }
      });

    const standings = Array.from(rows.values()).map((row) => ({
      ...row,
      matchScoreDiff: row.matchScoreFor - row.matchScoreAgainst,
      legScoreDiff: row.legScoreFor - row.legScoreAgainst,
    }));

    return NextResponse.json({
      seasons: seasons.data ?? [],
      leagues: leagues.data ?? [],
      groups: groups.data ?? [],
      selected: {
        seasonId: selectedSeasonId,
        leagueId: selectedLeague?.id ?? "",
        groupId: selectedGroup?.id ?? "",
      },
      standings: standings.sort(compareStandingRows),
    });
  } catch {
    return NextResponse.json(
      { error: "Veřejné tabulky se nepodařilo načíst." },
      { status: 500 },
    );
  }
}
