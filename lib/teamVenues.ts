export type TeamVenueFields = {
  playing_venue_address?: string | null;
  additional_playing_venues?: string[] | null;
};

export function parseTeamVenueList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20 || value.some(
    (venue) => typeof venue !== "string" || venue.trim().length > 500,
  )) return null;
  return [...new Set((value as string[]).map((venue) => venue.trim()).filter(Boolean))];
}

export function teamVenues(team: TeamVenueFields | null | undefined, fallback?: string | null): string[] {
  return [...new Set([
    team?.playing_venue_address ?? fallback ?? "",
    ...(team?.additional_playing_venues ?? []),
  ].map((venue) => venue.trim()).filter(Boolean))];
}

export function matchVenue(override: string | null | undefined, defaultVenue?: string | null): string | null {
  return override?.trim() || defaultVenue?.trim() || null;
}
