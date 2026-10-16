alter table public.teams
  add column if not exists additional_playing_venues text[] not null default '{}';

alter table public.matches
  add column if not exists venue_override text;

comment on column public.teams.additional_playing_venues is
  'Additional venues in display order. playing_venue_address remains the default venue.';
comment on column public.matches.venue_override is
  'Manually selected home venue snapshot. NULL follows the home team default venue.';

notify pgrst, 'reload schema';
