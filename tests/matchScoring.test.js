const assert = require("node:assert/strict");
const {
  OUTCOMES,
  buildStandings,
  calculateMatchResult,
} = require("../app/lib/matchScoring");

assert.deepEqual(calculateMatchResult(7, 5), {
  outcome: OUTCOMES.HOME_WIN,
  homePoints: 3,
  awayPoints: 0,
  homeResult: "win",
  awayResult: "loss",
});

assert.deepEqual(calculateMatchResult(4, 4), {
  outcome: OUTCOMES.DRAW,
  homePoints: 1,
  awayPoints: 1,
  homeResult: "draw",
  awayResult: "draw",
});

assert.deepEqual(calculateMatchResult(2, 6), {
  outcome: OUTCOMES.AWAY_WIN,
  homePoints: 0,
  awayPoints: 3,
  homeResult: "loss",
  awayResult: "win",
});

assert.throws(() => calculateMatchResult(-1, 0), /homeScore/);
assert.throws(() => calculateMatchResult(1.5, 0), /homeScore/);

const standings = buildStandings([
  { homeTeam: "DC Stiky", awayTeam: "DC Vlci", homeScore: 5, awayScore: 5 },
  { homeTeam: "DC Rafani", awayTeam: "DC Stiky", homeScore: 6, awayScore: 3 },
  { homeTeam: "DC Vlci", awayTeam: "DC Rafani", homeScore: 7, awayScore: 4 },
  { homeTeam: "Not played", awayTeam: "DC Stiky", homeScore: null, awayScore: null },
]);

assert.deepEqual(standings, [
  {
    team: "DC Vlci",
    played: 2,
    wins: 1,
    draws: 1,
    losses: 0,
    scoreFor: 12,
    scoreAgainst: 9,
    scoreDifference: 3,
    points: 4,
  },
  {
    team: "DC Rafani",
    played: 2,
    wins: 1,
    draws: 0,
    losses: 1,
    scoreFor: 10,
    scoreAgainst: 10,
    scoreDifference: 0,
    points: 3,
  },
  {
    team: "DC Stiky",
    played: 2,
    wins: 0,
    draws: 1,
    losses: 1,
    scoreFor: 8,
    scoreAgainst: 11,
    scoreDifference: -3,
    points: 1,
  },
]);

console.log("match scoring tests passed");
