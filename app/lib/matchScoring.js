const OUTCOMES = Object.freeze({
  HOME_WIN: "home_win",
  DRAW: "draw",
  AWAY_WIN: "away_win",
});

function assertScore(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer.`);
  }
}

function calculateMatchResult(homeScore, awayScore) {
  assertScore(homeScore, "homeScore");
  assertScore(awayScore, "awayScore");

  if (homeScore > awayScore) {
    return {
      outcome: OUTCOMES.HOME_WIN,
      homePoints: 3,
      awayPoints: 0,
      homeResult: "win",
      awayResult: "loss",
    };
  }

  if (homeScore < awayScore) {
    return {
      outcome: OUTCOMES.AWAY_WIN,
      homePoints: 0,
      awayPoints: 3,
      homeResult: "loss",
      awayResult: "win",
    };
  }

  return {
    outcome: OUTCOMES.DRAW,
    homePoints: 1,
    awayPoints: 1,
    homeResult: "draw",
    awayResult: "draw",
  };
}

function createEmptyStanding(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    scoreDifference: 0,
    points: 0,
  };
}

function addTeamResult(row, ownScore, opponentScore, result, points) {
  row.played += 1;
  row.scoreFor += ownScore;
  row.scoreAgainst += opponentScore;
  row.scoreDifference = row.scoreFor - row.scoreAgainst;
  row.points += points;

  if (result === "win") row.wins += 1;
  if (result === "draw") row.draws += 1;
  if (result === "loss") row.losses += 1;
}

function buildStandings(matches) {
  const standings = new Map();

  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null) {
      continue;
    }

    const result = calculateMatchResult(match.homeScore, match.awayScore);

    if (!standings.has(match.homeTeam)) {
      standings.set(match.homeTeam, createEmptyStanding(match.homeTeam));
    }
    if (!standings.has(match.awayTeam)) {
      standings.set(match.awayTeam, createEmptyStanding(match.awayTeam));
    }

    addTeamResult(
      standings.get(match.homeTeam),
      match.homeScore,
      match.awayScore,
      result.homeResult,
      result.homePoints
    );
    addTeamResult(
      standings.get(match.awayTeam),
      match.awayScore,
      match.homeScore,
      result.awayResult,
      result.awayPoints
    );
  }

  return [...standings.values()].sort(compareStandingRows);
}

function compareStandingRows(a, b) {
  return (
    b.points - a.points ||
    b.scoreDifference - a.scoreDifference ||
    b.scoreFor - a.scoreFor ||
    a.team.localeCompare(b.team, "cs")
  );
}

module.exports = {
  OUTCOMES,
  buildStandings,
  calculateMatchResult,
  compareStandingRows,
};
