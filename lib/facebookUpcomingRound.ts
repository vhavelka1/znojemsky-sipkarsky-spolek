import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

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
  homeTeam: FacebookTeam;
  awayTeam: FacebookTeam;
};

export type FacebookRoundPayload = {
  selections: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    roundNumber: number | null;
  };
  seasons: FacebookSeason[];
  leagues: FacebookLeague[];
  groups: FacebookGroup[];
  rounds: number[];
  matches: FacebookRoundMatch[];
  byes: FacebookTeam[];
  caption: string;
  selectedSeason: FacebookSeason | null;
  selectedLeague: FacebookLeague | null;
  selectedGroup: FacebookGroup | null;
};

type QueryInput = {
  seasonId?: string | null;
  leagueId?: string | null;
  groupId?: string | null;
  roundNumber?: string | number | null;
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
};

function roundValue(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return Number(value);
  }

  return null;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function teamLabel(teamSeason: TeamSeasonRow | undefined, team: TeamRow | undefined) {
  return teamSeason?.display_name || team?.name || "Neznámý tým";
}

function buildCaption(
  roundNumber: number | null,
  groupName: string | undefined,
  matches: FacebookRoundMatch[],
  byes: FacebookTeam[],
) {
  if (!roundNumber) {
    return "";
  }

  const lines = [
    `🎯 ${roundNumber}. kolo${groupName ? ` – ${groupName}` : ""}`,
    "",
    "Další ligové kolo je před námi! 🎯",
    "",
  ];

  matches.forEach((match) => {
    lines.push(`📅 ${formatDate(match.scheduledAt)}`);
    lines.push(`${match.homeTeam.name} 🆚 ${match.awayTeam.name}`);
    lines.push(`🕕 ${formatTime(match.scheduledAt)}`);
    lines.push("");
  });

  byes.forEach((team) => {
    lines.push(`Volno: ${team.name}`);
  });

  return lines.join("\n").trim();
}

export async function loadFacebookUpcomingRound(input: QueryInput): Promise<FacebookRoundPayload> {
  const supabase = createSupabaseAdminClient();
  const [
    seasonsResult,
    leaguesResult,
    groupsResult,
    assignmentsResult,
    teamSeasonsResult,
    teamsResult,
    matchesResult,
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
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at")
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true })
      .returns<MatchRow[]>(),
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
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at")
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
    matchesError;

  if (error) {
    throw new Error(error.message);
  }

  const seasonRows = seasonsResult.data ?? [];
  const leagueRows = leaguesResult.data ?? [];
  const groupRows = groupsResult.data ?? [];
  const assignmentRows = assignmentsResult.data ?? [];
  const teamSeasonRows = teamSeasonsResult.data ?? [];
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
  const selectedGroup =
    groupRows.find(
      (group) => group.id === input.groupId && group.league_id === selectedLeague?.id,
    ) ??
    groupRows.find((group) => group.league_id === selectedLeague?.id) ??
    null;

  const matchesForGroup = matchRows.filter(
    (match) =>
      match.season_id === selectedSeason?.id &&
      match.league_id === selectedLeague?.id &&
      match.group_id === selectedGroup?.id,
  );
  const rounds = Array.from(
    new Set(
      matchesForGroup
        .map((match) => roundValue(match.round_number))
        .filter((value): value is number => value !== null),
    ),
  ).sort((first, second) => first - second);
  const requestedRound = roundValue(input.roundNumber);
  const now = Date.now();
  const nextRound =
    matchesForGroup.find((match) => new Date(match.scheduled_at).getTime() >= now)?.round_number ??
    matchesForGroup[0]?.round_number ??
    null;
  const selectedRound = rounds.includes(requestedRound ?? 0)
    ? requestedRound
    : roundValue(nextRound) ?? rounds[0] ?? null;

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamSeasonById = new Map(teamSeasonRows.map((teamSeason) => [teamSeason.id, teamSeason]));

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

  const matches = matchesForGroup
    .filter((match) => roundValue(match.round_number) === selectedRound)
    .map((match) => ({
      id: match.id,
      roundNumber: selectedRound ?? 0,
      scheduledAt: match.scheduled_at,
      homeTeam: teamPayload(match.home_team_id),
      awayTeam: teamPayload(match.away_team_id),
    }));

  const playingTeamSeasonIds = new Set(
    matches.flatMap((match) => [match.homeTeam.teamSeasonId, match.awayTeam.teamSeasonId]),
  );
  const byes = assignmentRows
    .filter(
      (assignment) =>
        assignment.league_group_id === selectedGroup?.id &&
        !playingTeamSeasonIds.has(assignment.team_season_id),
    )
    .map((assignment) => teamPayload(assignment.team_season_id))
    .filter((team) => team.name !== "Neznámý tým")
    .sort((first, second) => first.name.localeCompare(second.name, "cs"));

  return {
    selections: {
      seasonId: selectedSeason?.id ?? "",
      leagueId: selectedLeague?.id ?? "",
      groupId: selectedGroup?.id ?? "",
      roundNumber: selectedRound,
    },
    seasons: seasonRows.map((season) => ({
      id: season.id,
      name: season.name,
      isActive: season.is_active,
      startsOn: season.starts_on,
    })),
    leagues: leagueRows.map((league) => ({
      id: league.id,
      seasonId: league.season_id,
      name: league.name,
    })),
    groups: groupRows.map((group) => ({
      id: group.id,
      leagueId: group.league_id,
      name: group.name,
      sortOrder: group.sort_order,
    })),
    rounds,
    matches,
    byes,
    caption: buildCaption(selectedRound, selectedGroup?.name, matches, byes),
    selectedSeason: selectedSeason
      ? {
          id: selectedSeason.id,
          name: selectedSeason.name,
          isActive: selectedSeason.is_active,
          startsOn: selectedSeason.starts_on,
        }
      : null,
    selectedLeague: selectedLeague
      ? {
          id: selectedLeague.id,
          seasonId: selectedLeague.season_id,
          name: selectedLeague.name,
        }
      : null,
    selectedGroup: selectedGroup
      ? {
          id: selectedGroup.id,
          leagueId: selectedGroup.league_id,
          name: selectedGroup.name,
          sortOrder: selectedGroup.sort_order,
        }
      : null,
  };
}
