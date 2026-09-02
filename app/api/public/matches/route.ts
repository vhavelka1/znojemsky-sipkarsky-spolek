import { NextRequest, NextResponse } from "next/server";
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
  playing_venue_address?: string | null;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
  home_venue: string | null;
};

type LeagueGroupTeam = {
  id: string;
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
  round_number: number | string | null;
  scheduled_at: string;
  played_at: string | null;
  status: MatchStatus;
};

type MatchResult = {
  match_id: string;
  home_points: number;
  away_points: number;
};

type PublicMatchTeam = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
  venue: string | null;
};

type PublicMatch = {
  id: string;
  seasonId: string;
  leagueId: string;
  groupId: string;
  roundNumber: number | null;
  scheduledAt: string;
  playedAt: string | null;
  status: MatchStatus;
  venue: string | null;
  homeTeam: PublicMatchTeam;
  awayTeam: PublicMatchTeam;
  result: {
    homePoints: number;
    awayPoints: number;
  } | null;
};

type PublicMatchBye = {
  roundNumber: number;
  team: PublicMatchTeam;
};

function isMissingOptionalTeamColumn(message: string) {
  return ["logo_url", "playing_venue_address"].some((column) => message.includes(column));
}

function isMissingRoundNumberColumn(message: string) {
  return message.includes("round_number");
}

function roundValue(value: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const [seasons, leagues, groups, teamSeasons, teamsWithOptionalColumns, assignments, matches, results] =
      await Promise.all([
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
          .select("id, team_id, season_id, display_name, home_venue")
          .is("deleted_at", null)
          .returns<TeamSeason[]>(),
        supabase
          .from("teams")
          .select("id, name, slug, logo_url, playing_venue_address")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("league_group_teams")
          .select("id, league_group_id, team_season_id")
          .is("deleted_at", null)
          .returns<LeagueGroupTeam[]>(),
        supabase
          .from("matches")
          .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at, played_at, status")
          .is("deleted_at", null)
          .returns<Match[]>(),
        supabase
          .from("match_results")
          .select("match_id, home_points, away_points")
          .is("deleted_at", null)
          .returns<MatchResult[]>(),
      ]);

    let teamRows = teamsWithOptionalColumns.data as Team[] | null;
    let teamsError = teamsWithOptionalColumns.error;

    if (teamsError?.message && isMissingOptionalTeamColumn(teamsError.message)) {
      const fallback = await supabase
        .from("teams")
        .select("id, name, slug")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<Team[]>();
      teamRows = fallback.data;
      teamsError = fallback.error;
    }

    let matchRows = matches.data ?? [];
    let matchesError = matches.error;
    if (matchesError?.message && isMissingRoundNumberColumn(matchesError.message)) {
      const fallback = await supabase
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .is("deleted_at", null)
        .returns<Array<Omit<Match, "round_number">>>();

      matchRows = (fallback.data ?? []).map((match) => ({ ...match, round_number: null }));
      matchesError = fallback.error;
    }

    const error =
      seasons.error ??
      leagues.error ??
      groups.error ??
      teamSeasons.error ??
      teamsError ??
      assignments.error ??
      matchesError ??
      results.error;

    if (error) {
      return NextResponse.json({ error: "Zápasy se nepodařilo načíst." }, { status: 500 });
    }

    const seasonRows = seasons.data ?? [];
    const leagueRows = leagues.data ?? [];
    const groupRows = groups.data ?? [];
    const teamSeasonRows = teamSeasons.data ?? [];
    const assignmentRows = assignments.data ?? [];
    const resultRows = results.data ?? [];
    const teams = (teamRows ?? []).map((team) => ({
      ...team,
      logo_url: teamLogoUrl(team.slug, team.logo_url),
    }));

    const activeSeason = seasonRows.find((season) => season.is_active) ?? seasonRows[0] ?? null;
    const selectedSeasonId = request.nextUrl.searchParams.get("season_id") || activeSeason?.id || "";
    const selectedLeague =
      leagueRows.find(
        (league) =>
          league.id === request.nextUrl.searchParams.get("league_id") &&
          league.season_id === selectedSeasonId,
      ) ??
      leagueRows.find((league) => league.season_id === selectedSeasonId) ??
      null;
    const selectedGroup =
      groupRows.find(
        (group) =>
          group.id === request.nextUrl.searchParams.get("group_id") &&
          group.league_id === selectedLeague?.id,
      ) ??
      groupRows.find((group) => group.league_id === selectedLeague?.id) ??
      null;

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const teamSeasonById = new Map(teamSeasonRows.map((teamSeason) => [teamSeason.id, teamSeason]));
    const resultByMatchId = new Map(resultRows.map((result) => [result.match_id, result]));
    const groupsInSelectedLeague = groupRows.filter((group) => group.league_id === selectedLeague?.id);

    function teamPayload(teamSeasonId: string): PublicMatchTeam {
      const teamSeason = teamSeasonById.get(teamSeasonId);
      const team = teamSeason ? teamById.get(teamSeason.team_id) : null;

      return {
        teamSeasonId,
        name: teamSeason?.display_name || team?.name || "Neznámý tým",
        logoUrl: team?.logo_url ?? null,
        venue: team?.playing_venue_address ?? teamSeason?.home_venue ?? null,
      };
    }

    const matchesForSelectedCompetition: PublicMatch[] = matchRows
      .filter(
        (match) =>
          match.season_id === selectedSeasonId &&
          match.league_id === selectedLeague?.id &&
          (!selectedGroup || match.group_id === selectedGroup.id),
      )
      .map((match) => {
        const homeTeam = teamPayload(match.home_team_id);
        const awayTeam = teamPayload(match.away_team_id);
        const result = resultByMatchId.get(match.id);

        return {
          id: match.id,
          seasonId: match.season_id,
          leagueId: match.league_id,
          groupId: match.group_id,
          roundNumber: roundValue(match.round_number),
          scheduledAt: match.scheduled_at,
          playedAt: match.played_at,
          status: match.status,
          venue: homeTeam.venue,
          homeTeam,
          awayTeam,
          result: result
            ? {
                homePoints: result.home_points,
                awayPoints: result.away_points,
              }
            : null,
        };
      });

    const teamsByTeamSeasonId = new Map<string, PublicMatchTeam>();
    const selectedGroupIds = selectedGroup
      ? [selectedGroup.id]
      : groupsInSelectedLeague.map((group) => group.id);

    assignmentRows
      .filter((assignment) => selectedGroupIds.includes(assignment.league_group_id))
      .forEach((assignment) => {
        teamsByTeamSeasonId.set(assignment.team_season_id, teamPayload(assignment.team_season_id));
      });

    if (teamsByTeamSeasonId.size === 0) {
      matchesForSelectedCompetition.forEach((match) => {
        teamsByTeamSeasonId.set(match.homeTeam.teamSeasonId, match.homeTeam);
        teamsByTeamSeasonId.set(match.awayTeam.teamSeasonId, match.awayTeam);
      });
    }

    const availableTeams = Array.from(teamsByTeamSeasonId.values()).sort((first, second) =>
      first.name.localeCompare(second.name, "cs"),
    );
    const requestedTeamSeasonId = request.nextUrl.searchParams.get("team_season_id") ?? "";
    const selectedTeamSeasonId = availableTeams.some((team) => team.teamSeasonId === requestedTeamSeasonId)
      ? requestedTeamSeasonId
      : "";

    const roundNumbers = Array.from(
      new Set(
        matchesForSelectedCompetition
          .map((match) => match.roundNumber)
          .filter((roundNumber): roundNumber is number => roundNumber !== null),
      ),
    ).sort((first, second) => first - second);

    const byes: PublicMatchBye[] = roundNumbers.flatMap((roundNumber) => {
      const roundMatches = matchesForSelectedCompetition.filter((match) => match.roundNumber === roundNumber);
      const playingTeamSeasonIds = new Set(
        roundMatches.flatMap((match) => [match.homeTeam.teamSeasonId, match.awayTeam.teamSeasonId]),
      );

      return availableTeams
        .filter((team) => !playingTeamSeasonIds.has(team.teamSeasonId))
        .map((team) => ({ roundNumber, team }));
    });

    const filteredMatches = matchesForSelectedCompetition
      .filter(
        (match) =>
          !selectedTeamSeasonId ||
          match.homeTeam.teamSeasonId === selectedTeamSeasonId ||
          match.awayTeam.teamSeasonId === selectedTeamSeasonId,
      )
      .sort((first, second) => {
        const firstRound = first.roundNumber ?? Number.MAX_SAFE_INTEGER;
        const secondRound = second.roundNumber ?? Number.MAX_SAFE_INTEGER;
        if (firstRound !== secondRound) return firstRound - secondRound;
        return new Date(first.scheduledAt).getTime() - new Date(second.scheduledAt).getTime();
      });
    const filteredByes = byes.filter(
      (bye) => !selectedTeamSeasonId || bye.team.teamSeasonId === selectedTeamSeasonId,
    );

    return NextResponse.json({
      seasons: seasonRows,
      leagues: leagueRows,
      groups: groupRows,
      selected: {
        seasonId: selectedSeasonId,
        leagueId: selectedLeague?.id ?? "",
        groupId: selectedGroup?.id ?? "",
        teamSeasonId: selectedTeamSeasonId,
      },
      teams: availableTeams,
      matches: filteredMatches,
      byes: filteredByes,
      hasGroupsForSelectedLeague: groupsInSelectedLeague.length > 0,
    });
  } catch {
    return NextResponse.json({ error: "Zápasy se nepodařilo načíst." }, { status: 500 });
  }
}
