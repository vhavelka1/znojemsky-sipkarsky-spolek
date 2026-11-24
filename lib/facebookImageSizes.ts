export function scheduleImageHeight(matchCount: number, hasByes: boolean) {
  // Allow for longer rows containing a result or an original-round label.
  const rows = matchCount * 160 + Math.max(0, matchCount - 1) * 14;
  return Math.max(1080, 52 + 200 + 34 + rows + (hasByes ? 82 : 0) + 52);
}
