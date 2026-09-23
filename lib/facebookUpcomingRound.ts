import { buildLeagueGroupStandings, isFinishedMatch, type MatchStatus, type StandingRow } from "@/lib/leagueStandings";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

export type FacebookPostType = "upcoming" | "results";
export type FacebookImageKind = "upcoming_schedule" | "results" | "standings";

export type FacebookSeason = {
  id: string;
  name: string;
  isActive: boolean;
  startsOn: string;
};

export type FacebookLeague = {
  id: string;
  seasonId: string;
  name: string;
};

export type FacebookGroup = {
  id: string;
  leagueId: string;
  name: string;
  sortOrder: number;
};

export type FacebookTeam = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
  venue: string | null;
};

export type FacebookRoundMatch = {
  id: string;
  roundNumber: number;
  scheduledAt: string;
  playedAt: string | null;
  status: MatchStatus;
  homeTeam: FacebookTeam;
  awayTeam: FacebookTeam;
  result: {
    homePoints: number;
    awayPoints: number;
  } | null;
};

export type FacebookGroupRound = {
  group: FacebookGroup;
  matches: FacebookRoundMatch[];
  byes: FacebookTeam[];
  standings: StandingRow[];
};

export type FacebookPostImage = {
  id: string;
  kind: FacebookImageKind;
  groupId: string;
  groupName: string;
  label: string;
};

export type FacebookRoundPayload = {
  selections: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    roundNumber: number | null;
    postType: FacebookPostType;
  };
  seasons: FacebookSeason[];
  leagues: FacebookLeague[];
  groups: FacebookGroup[];
  selectedGroups: FacebookGroupRound[];
  rounds: number[];
  matches: FacebookRoundMatch[];
  byes: FacebookTeam[];
  standings: StandingRow[];
  images: FacebookPostImage[];
  caption: string;
  publicUrl: string;
  selectedSeason: FacebookSeason | null;
  selectedLeague: FacebookLeague | null;
  selectedGroup: FacebookGroup | null;
};

type QueryInput = {
  seasonId?: string | null;
  leagueId?: string | null;
  groupId?: string | null;
  roundNumber?: string | number | null;
  postType?: string | null;
  origin?: string | null;
};

type SeasonRow = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type LeagueRow = {
  id: string;
  season_id: string;
  name: string;
};

type GroupRow = {
  id: string;
  league_id: string;
  name: string;
  sort_order: number;
};

type AssignmentRow = {
  league_group_id: string;
  team_season_id: string;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
  home_venue: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  playing_venue_address?: string | null;
};

type MatchRow = {
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

type MatchResultRow = {
  match_id: string;
  home_points: number;
  away_points: number;
};

type MatchGameRow = {
  match_id: string;
  home_legs: number;
  away_legs: number;
};

function roundValue(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

function postTypeValue(value: string | null | undefined): FacebookPostType {
  return value === "results" ? "results" : "upcoming";
}

function isMissingOptionalTeamColumn(message: string | undefined) {
  return Boolean(
    message &&
      ["logo_url", "playing_venue_address"].some((column) => message.includes(column)),
  );
}

function isMissingRoundNumberColumn(message: string | undefined) {
  return Boolean(message?.includes("round_number"));
}

function teamLabel(teamSeason: TeamSeasonRow | undefined, team: TeamRow | undefined) {
  return teamSeason?.display_name || team?.name || "Neznámý tým";
}

function publicMatchesUrl(origin: string | null | undefined, seasonId: string, leagueId: string) {
  const params = new URLSearchParams();
  if (seasonId) params.set("season_id", seasonId);
  if (leagueId) params.set("league_id", leagueId);
  params.set("view", "rounds");
  const path = `/zapasy?${params.toString()}`;

  if (!origin) return path;
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

function buildCaption({
  league,
  postType,
  publicUrl,
  roundNumber,
  season,
}: {
  league: FacebookLeague | null;
  postType: FacebookPostType;
  publicUrl: string;
  roundNumber: number | null;
  season: FacebookSeason | null;
}) {
  if (!roundNumber) return "";

  if (postType === "results") {
    return [
      `🎯 ${roundNumber}. kolo Znojemské ligy týmů je za námi.`,
      "",
      "Přinášíme výsledky utkání a aktuální tabulky jednotlivých skupin.",
      "",
      "Kompletní výsledky a zápisy utkání najdete v aplikaci:",
      publicUrl,
    ].join("\n");
  }

  return [
    `🎯 ${league?.name ?? "Znojemská liga týmů"}${season?.name ? ` – ${season.name}` : ""} – ${roundNumber}. kolo`,
    "",
    "Další ligové kolo je před námi.",
    "Níže najdete rozpis utkání všech skupin.",
    "",
    "Kompletní program najdete v aplikaci:",
    publicUrl,
  ].join("\n");
}

function toSeason(row: SeasonRow): FacebookSeason {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    startsOn: row.starts_on,
  };
}

function toLeague(row: LeagueRow): FacebookLeague {
  return {
    id: row.id,
    seasonId: row.season_id,
    name: row.name,
  };
}

function toGroup(row: GroupRow): FacebookGroup {
  return {
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

export async function loadFacebookUpcomingRound(input: QueryInput): Promise<FacebookRoundPayload> {
  const supabase = createSupabaseAdminClient();
  const postType = postTypeValue(input.postType);
  const [
    seasonsResult,
    leaguesResult,
    groupsResult,
    assignmentsResult,
    teamSeasonsResult,
    teamsResult,
    matchesResult,
    resultsResult,
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .returns<SeasonRow[]>(),
    supabase
      .from("leagues")
      .select("id, season_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<LeagueRow[]>(),
    supabase
      .from("league_groups")
      .select("id, league_id, name, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .returns<GroupRow[]>(),
    supabase
      .from("league_group_teams")
      .select("league_group_id, team_season_id")
      .is("deleted_at", null)
      .returns<AssignmentRow[]>(),
    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name, home_venue")
      .is("deleted_at", null)
      .returns<TeamSeasonRow[]>(),
    supabase
      .from("teams")
      .select("id, name, slug, logo_url, playing_venue_address")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at, played_at, status")
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true })
      .returns<MatchRow[]>(),
    supabase
      .from("match_results")
      .select("match_id, home_points, away_points")
      .is("deleted_at", null)
      .returns<MatchResultRow[]>(),
  ]);

  let teamRows = teamsResult.data as TeamRow[] | null;
  let teamsError = teamsResult.error;

  if (isMissingOptionalTeamColumn(teamsError?.message)) {
    const fallback = await supabase
      .from("teams")
      .select("id, name, slug")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<TeamRow[]>();
    teamRows = fallback.data;
    teamsError = fallback.error;
  }

  let matchRows = matchesResult.data ?? [];
  let matchesError = matchesResult.error;

  if (isMissingRoundNumberColumn(matchesError?.message)) {
    const fallback = await supabase
      .from("matches")
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true })
      .returns<Array<Omit<MatchRow, "round_number">>>();
    matchRows = (fallback.data ?? []).map((match) => ({ ...match, round_number: null }));
    matchesError = fallback.error;
  }

  const error =
    seasonsResult.error ??
    leaguesResult.error ??
    groupsResult.error ??
    assignmentsResult.error ??
    teamSeasonsResult.error ??
    teamsError ??
    matchesError ??
    resultsResult.error;

  if (error) throw new Error(error.message);

  const seasonRows = seasonsResult.data ?? [];
  const leagueRows = leaguesResult.data ?? [];
  const groupRows = groupsResult.data ?? [];
  const assignmentRows = assignmentsResult.data ?? [];
  const teamSeasonRows = teamSeasonsResult.data ?? [];
  const resultRows = resultsResult.data ?? [];
  const teams = (teamRows ?? []).map((team) => ({
    ...team,
    logo_url: teamLogoUrl(team.slug, team.logo_url),
  }));

  const selectedSeason =
    seasonRows.find((season) => season.id === input.seasonId) ??
    seasonRows.find((season) => season.is_active) ??
    seasonRows[0] ??
    null;
  const selectedLeague =
    leagueRows.find(
      (league) => league.id === input.leagueId && league.season_id === selectedSeason?.id,
    ) ??
    leagueRows.find((league) => league.season_id === selectedSeason?.id) ??
    null;
  const leagueGroups = groupRows.filter((group) => group.league_id === selectedLeague?.id);

  const matchesForLeague = matchRows.filter(
    (match) =>
      match.season_id === selectedSeason?.id &&
      match.league_id === selectedLeague?.id &&
      leagueGroups.some((group) => group.id === match.group_id),
  );
  const rounds = Array.from(
    new Set(
      matchesForLeague
        .map((match) => roundValue(match.round_number))
        .filter((value): value is number => value !== null),
    ),
  ).sort((first, second) => first - second);
  const requestedRound = roundValue(input.roundNumber);
  const now = Date.now();
  const nextRound =
    matchesForLeague.find((match) => new Date(match.scheduled_at).getTime() >= now)?.round_number ??
    matchesForLeague[0]?.round_number ??
    null;
  const selectedRound = rounds.includes(requestedRound ?? 0)
    ? requestedRound
    : roundValue(nextRound) ?? rounds[0] ?? null;

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamSeasonById = new Map(teamSeasonRows.map((teamSeason) => [teamSeason.id, teamSeason]));
  const resultByMatchId = new Map(resultRows.map((result) => [result.match_id, result]));

  function teamPayload(teamSeasonId: string): FacebookTeam {
    const teamSeason = teamSeasonById.get(teamSeasonId);
    const team = teamSeason ? teamById.get(teamSeason.team_id) : undefined;

    return {
      teamSeasonId,
      name: teamLabel(teamSeason, team),
      logoUrl: team?.logo_url ?? null,
      venue: team?.playing_venue_address ?? teamSeason?.home_venue ?? null,
    };
  }

  const matchIdsForLegs = matchesForLeague
    .filter((match) => isFinishedMatch(match) && resultByMatchId.has(match.id))
    .map((match) => match.id);
  let matchGames: MatchGameRow[] = [];
  if (matchIdsForLegs.length > 0) {
    const gamesResult = await supabase
      .from("match_games")
      .select("match_id, home_legs, away_legs")
      .in("match_id", matchIdsForLegs)
      .is("deleted_at", null)
      .returns<MatchGameRow[]>();
    matchGames = gamesResult.error ? [] : gamesResult.data ?? [];
  }

  const selectedGroups = leagueGroups.map((group) => {
    const groupRoundMatches = matchesForLeague
      .filter(
        (match) =>
          match.group_id === group.id &&
          roundValue(match.round_number) === selectedRound,
      )
      .map((match): FacebookRoundMatch => {
        const result = resultByMatchId.get(match.id);
        return {
          id: match.id,
          roundNumber: selectedRound ?? 0,
          scheduledAt: match.scheduled_at,
          playedAt: match.played_at,
          status: match.status,
          homeTeam: teamPayload(match.home_team_id),
          awayTeam: teamPayload(match.away_team_id),
          result: result
            ? { homePoints: result.home_points, awayPoints: result.away_points }
            : null,
        };
      });

    const playingTeamSeasonIds = new Set(
      groupRoundMatches.flatMap((match) => [match.homeTeam.teamSeasonId, match.awayTeam.teamSeasonId]),
    );
    const byes = assignmentRows
      .filter(
        (assignment) =>
          assignment.league_group_id === group.id &&
          !playingTeamSeasonIds.has(assignment.team_season_id),
      )
      .map((assignment) => teamPayload(assignment.team_season_id))
      .filter((team) => team.name !== "Neznámý tým")
      .sort((first, second) => first.name.localeCompare(second.name, "cs"));

    const standings = buildLeagueGroupStandings({
      assignments: assignmentRows,
      groupId: group.id,
      matches: matchesForLeague,
      matchGames,
      results: resultRows,
      teams,
      teamSeasons: teamSeasonRows,
    });

    return {
      group: toGroup(group),
      matches: groupRoundMatches,
      byes,
      standings,
    };
  });

  const selectedGroup = selectedGroups[0]?.group ?? null;
  const flatMatches = selectedGroups.flatMap((group) => group.matches);
  const flatByes = selectedGroups.flatMap((group) => group.byes);
  const flatStandings = selectedGroups.flatMap((group) => group.standings);
  const publicUrl = publicMatchesUrl(input.origin, selectedSeason?.id ?? "", selectedLeague?.id ?? "");
  const selectedSeasonPayload = selectedSeason ? toSeason(selectedSeason) : null;
  const selectedLeaguePayload = selectedLeague ? toLeague(selectedLeague) : null;

  const images: FacebookPostImage[] =
    postType === "results"
      ? selectedGroups.flatMap((group) => [
          {
            id: `${group.group.id}:results`,
            kind: "results" as const,
            groupId: group.group.id,
            groupName: group.group.name,
            label: `${group.group.name} - výsledky`,
          },
          {
            id: `${group.group.id}:standings`,
            kind: "standings" as const,
            groupId: group.group.id,
            groupName: group.group.name,
            label: `${group.group.name} - tabulka`,
          },
        ])
      : selectedGroups.map((group) => ({
          id: `${group.group.id}:upcoming_schedule`,
          kind: "upcoming_schedule",
          groupId: group.group.id,
          groupName: group.group.name,
          label: `${group.group.name} - rozpis`,
        }));

  return {
    selections: {
      seasonId: selectedSeason?.id ?? "",
      leagueId: selectedLeague?.id ?? "",
      groupId: selectedGroup?.id ?? "",
      roundNumber: selectedRound,
      postType,
    },
    seasons: seasonRows.map(toSeason),
    leagues: leagueRows.map(toLeague),
    groups: groupRows.map(toGroup),
    selectedGroups,
    rounds,
    matches: flatMatches,
    byes: flatByes,
    standings: flatStandings,
    images,
    caption: buildCaption({
      league: selectedLeaguePayload,
      postType,
      publicUrl,
      roundNumber: selectedRound,
      season: selectedSeasonPayload,
    }),
    publicUrl,
    selectedSeason: selectedSeasonPayload,
    selectedLeague: selectedLeaguePayload,
    selectedGroup,
  };
}
