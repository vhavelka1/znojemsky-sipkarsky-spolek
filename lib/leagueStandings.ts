export type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";

export type StandingTeam = {
  id: string;
  name: string;
  logo_url?: string | null;
};

export type StandingTeamSeason = {
  id: string;
  team_id: string;
  display_name: string | null;
};

export type StandingAssignment = {
  league_group_id: string;
  team_season_id: string;
};

export type StandingMatch = {
  id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  status: MatchStatus;
};

export type StandingResult = {
  match_id: string;
  home_points: number;
  away_points: number;
};

export type StandingMatchGame = {
  match_id: string;
  home_legs: number;
  away_legs: number;
};

export type StandingRow = {
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

export function isFinishedMatch(match: { status: MatchStatus }) {
  return (
    match.status === "played" ||
    match.status === "confirmed" ||
    match.status === "awaiting_confirmation"
  );
}

export function compareStandingRows(first: StandingRow, second: StandingRow) {
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

export function buildLeagueGroupStandings({
  assignments,
  groupId,
  matches,
  matchGames,
  results,
  teams,
  teamSeasons,
}: {
  assignments: StandingAssignment[];
  groupId: string;
  matches: StandingMatch[];
  matchGames: StandingMatchGame[];
  results: StandingResult[];
  teams: StandingTeam[];
  teamSeasons: StandingTeamSeason[];
}) {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamSeasonById = new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason]));
  const resultByMatchId = new Map(results.map((result) => [result.match_id, result]));

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
  assignments
    .filter((assignment) => assignment.league_group_id === groupId)
    .forEach((assignment) => {
      const team = teamSeasonLabel(assignment.team_season_id);
      rows.set(assignment.team_season_id, createEmptyRow(assignment.team_season_id, team.name, team.logoUrl));
    });

  matches
    .filter((match) => isFinishedMatch(match) && match.group_id === groupId)
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

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      matchScoreDiff: row.matchScoreFor - row.matchScoreAgainst,
      legScoreDiff: row.legScoreFor - row.legScoreAgainst,
    }))
    .sort(compareStandingRows);
}
