alter table public.player_registration_requests
  add column if not exists residence text,
  add column if not exists date_of_birth date;

alter table public.team_roster_requests
  add column if not exists requested_player_id uuid references public.players(id) on delete set null,
  add column if not exists requested_player_phone text,
  add column if not exists requested_player_residence text,
  add column if not exists requested_player_date_of_birth date;

create index if not exists team_roster_requests_requested_player_idx
  on public.team_roster_requests (requested_player_id)
  where requested_player_id is not null;
