export type TeamVenueFields = {
  playing_venue_address?: string | null;
  additional_playing_venues?: string[] | null;
};

export function teamVenues(team: TeamVenueFields | null | undefined, fallback?: string | null): string[] {
  return [...new Set([
    team?.playing_venue_address ?? fallback ?? "",
    ...(team?.additional_playing_venues ?? []),
  ].map((venue) => venue.trim()).filter(Boolean))];
}

export function matchVenue(override: string | null | undefined, defaultVenue?: string | null): string | null {
  return override?.trim() || defaultVenue?.trim() || null;
}
