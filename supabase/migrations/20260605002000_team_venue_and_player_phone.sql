alter table public.teams
  add column if not exists playing_venue_address text;

alter table public.players
  add column if not exists phone text;
