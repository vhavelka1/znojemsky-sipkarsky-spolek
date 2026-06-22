export type UsefulnessPlayerStats = {
  playedMatches: number;
  wonMatches: number;
  wonLegs: number;
  lostLegs: number;
  score95Plus: number;
  score133Plus: number;
  score171Plus: number;
  checkout100Plus: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateUsefulnessScore(
  playerStats: UsefulnessPlayerStats,
  maxPossibleSingles: number,
) {
  const playedMatches = playerStats.playedMatches;
  if (playedMatches <= 0) {
    return 0;
  }

  const winRateScore = (playerStats.wonMatches / playedMatches) * 100;
  const legDiffPerGame = (playerStats.wonLegs - playerStats.lostLegs) / playedMatches;
  const legScore = clamp(50 + legDiffPerGame * 10, 0, 100);
  const qualificationLimit = Math.max(1, Math.round(maxPossibleSingles * 0.3));
  const activityScore = Math.min(playedMatches / qualificationLimit, 1) * 100;
  const achievementScore =
    Math.min(
      (
        playerStats.score95Plus +
        playerStats.score133Plus * 2 +
        playerStats.score171Plus * 4 +
        playerStats.checkout100Plus * 5
      ) / playedMatches,
      10,
    ) * 10;

  const usefulness =
    winRateScore * 0.45 +
    legScore * 0.25 +
    activityScore * 0.15 +
    achievementScore * 0.15;

  return Math.round(usefulness * 10) / 10;
}
