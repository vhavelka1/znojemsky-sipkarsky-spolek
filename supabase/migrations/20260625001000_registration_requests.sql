create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.team_registration_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  team_name text not null,
  captain_name text not null,
  captain_email text not null,
  captain_phone text,
  preferred_league_id uuid references public.leagues(id) on delete set null,
  preferred_group_id uuid references public.league_groups(id) on delete set null,
  note text,
  status text not null default 'pending',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint team_registration_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint team_registration_requests_team_name_not_blank check (length(trim(team_name)) > 0),
  constraint team_registration_requests_captain_name_not_blank check (length(trim(captain_name)) > 0),
  constraint team_registration_requests_captain_email_not_blank check (length(trim(captain_email)) > 0)
);

create table if not exists public.team_registration_players (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.team_registration_requests(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  nickname text,
  email text,
  phone text,
  note text,
  matched_player_id uuid references public.players(id) on delete set null,
  player_status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint team_registration_players_status_valid check (player_status in ('active', 'needs_registration', 'new', 'duplicate', 'pending')),
  constraint team_registration_players_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint team_registration_players_last_name_not_blank check (length(trim(last_name)) > 0)
);

create table if not exists public.player_registration_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  first_name text not null,
  last_name text not null,
  nickname text,
  email text not null,
  phone text,
  preferred_team_name text,
  preferred_team_id uuid references public.teams(id) on delete set null,
  looking_for_team boolean not null default false,
  note text,
  status text not null default 'pending',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  matched_player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint player_registration_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint player_registration_requests_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint player_registration_requests_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint player_registration_requests_email_not_blank check (length(trim(email)) > 0)
);

create index if not exists team_registration_requests_status_idx
  on public.team_registration_requests (status, created_at desc)
  where deleted_at is null;

create index if not exists team_registration_requests_season_idx
  on public.team_registration_requests (season_id, created_at desc)
  where deleted_at is null;

create index if not exists team_registration_players_request_idx
  on public.team_registration_players (request_id, created_at);

create index if not exists team_registration_players_email_idx
  on public.team_registration_players (lower(email))
  where email is not null;

create index if not exists player_registration_requests_status_idx
  on public.player_registration_requests (status, created_at desc)
  where deleted_at is null;

create index if not exists player_registration_requests_email_idx
  on public.player_registration_requests (lower(email))
  where deleted_at is null;

drop trigger if exists team_registration_requests_set_updated_at on public.team_registration_requests;
create trigger team_registration_requests_set_updated_at
  before update on public.team_registration_requests
  for each row execute function public.set_updated_at();

drop trigger if exists player_registration_requests_set_updated_at on public.player_registration_requests;
create trigger player_registration_requests_set_updated_at
  before update on public.player_registration_requests
  for each row execute function public.set_updated_at();

alter table public.team_registration_requests enable row level security;
alter table public.team_registration_players enable row level security;
alter table public.player_registration_requests enable row level security;

drop policy if exists "Public can create team registration requests" on public.team_registration_requests;
create policy "Public can create team registration requests"
  on public.team_registration_requests for insert
  with check (status = 'pending' and deleted_at is null);

drop policy if exists "Public can create team registration players" on public.team_registration_players;
create policy "Public can create team registration players"
  on public.team_registration_players for insert
  with check (true);

drop policy if exists "Public can create player registration requests" on public.player_registration_requests;
create policy "Public can create player registration requests"
  on public.player_registration_requests for insert
  with check (status = 'pending' and deleted_at is null);

grant insert on public.team_registration_requests to anon, authenticated;
grant insert on public.team_registration_players to anon, authenticated;
grant insert on public.player_registration_requests to anon, authenticated;
grant select, insert, update, delete on public.team_registration_requests to service_role;
grant select, insert, update, delete on public.team_registration_players to service_role;
grant select, insert, update, delete on public.player_registration_requests to service_role;

insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values ('registrations', '/admin/registrace', 'Registrace', 'moderator')
on conflict (page_key) do update
set page_path = excluded.page_path,
    page_label = excluded.page_label,
    minimum_role = excluded.minimum_role;
