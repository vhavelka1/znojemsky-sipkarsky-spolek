create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leagues_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.league_groups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint league_groups_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.league_group_teams (
  id uuid primary key default gen_random_uuid(),
  league_group_id uuid not null references public.league_groups(id) on delete restrict,
  team_season_id uuid not null references public.team_seasons(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists leagues_season_name_active_uidx
  on public.leagues (season_id, lower(name))
  where deleted_at is null;

create unique index if not exists league_groups_league_name_active_uidx
  on public.league_groups (league_id, lower(name))
  where deleted_at is null;

create unique index if not exists league_group_teams_active_uidx
  on public.league_group_teams (league_group_id, team_season_id)
  where deleted_at is null;

create index if not exists leagues_season_id_idx
  on public.leagues (season_id)
  where deleted_at is null;

create index if not exists league_groups_league_id_idx
  on public.league_groups (league_id)
  where deleted_at is null;

create index if not exists league_group_teams_group_id_idx
  on public.league_group_teams (league_group_id)
  where deleted_at is null;

create index if not exists league_group_teams_team_season_id_idx
  on public.league_group_teams (team_season_id)
  where deleted_at is null;

create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

create trigger league_groups_set_updated_at
  before update on public.league_groups
  for each row execute function public.set_updated_at();

create trigger league_group_teams_set_updated_at
  before update on public.league_group_teams
  for each row execute function public.set_updated_at();

create trigger leagues_audit
  after insert or update or delete on public.leagues
  for each row execute function public.audit_row_change();

create trigger league_groups_audit
  after insert or update or delete on public.league_groups
  for each row execute function public.audit_row_change();

create trigger league_group_teams_audit
  after insert or update or delete on public.league_group_teams
  for each row execute function public.audit_row_change();

alter table public.leagues enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_group_teams enable row level security;

create policy "Anyone can view active leagues"
  on public.leagues for select
  using (deleted_at is null);

create policy "Anyone can view active league groups"
  on public.league_groups for select
  using (deleted_at is null);

create policy "Anyone can view active league group teams"
  on public.league_group_teams for select
  using (deleted_at is null);

create policy "Moderators can manage leagues"
  on public.leagues for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage league groups"
  on public.league_groups for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage league group teams"
  on public.league_group_teams for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant select, insert, update, delete on public.leagues to anon, authenticated;
grant select, insert, update, delete on public.league_groups to anon, authenticated;
grant select, insert, update, delete on public.league_group_teams to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on public.leagues to service_role;
grant all privileges on public.league_groups to service_role;
grant all privileges on public.league_group_teams to service_role;
