alter table public.team_registration_requests
  add column if not exists captain_address text,
  add column if not exists captain_date_of_birth date,
  add column if not exists assistant_captain_name text,
  add column if not exists assistant_captain_email text,
  add column if not exists assistant_captain_phone text,
  add column if not exists assistant_captain_address text,
  add column if not exists assistant_captain_date_of_birth date,
  add column if not exists wants_major_tournament boolean not null default false;

alter table public.team_registration_players
  add column if not exists address text,
  add column if not exists date_of_birth date;

alter table public.player_registration_requests
  add column if not exists residence text,
  add column if not exists date_of_birth date;

notify pgrst, 'reload schema';
