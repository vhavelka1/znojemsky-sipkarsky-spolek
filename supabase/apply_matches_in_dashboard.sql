-- Run this once in Supabase Dashboard > SQL Editor if /admin/matches says
-- that match tables are missing.

do $$
begin
  create type public.match_status as enum ('scheduled', 'played', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  league_id uuid not null references public.leagues(id) on delete restrict,
  group_id uuid not null references public.league_groups(id) on delete restrict,
  home_team_id uuid not null references public.team_seasons(id) on delete restrict,
  away_team_id uuid not null references public.team_seasons(id) on delete restrict,
  scheduled_at timestamptz not null,
  played_at timestamptz,
  status public.match_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint matches_teams_different check (home_team_id <> away_team_id),
  constraint matches_played_at_required check (
    status <> 'played'
    or played_at is not null
  )
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  home_points integer not null,
  away_points integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_results_points_non_negative check (
    home_points >= 0
    and away_points >= 0
  )
);

create unique index if not exists match_results_match_id_active_uidx
  on public.match_results (match_id)
  where deleted_at is null;

create index if not exists matches_season_id_idx
  on public.matches (season_id)
  where deleted_at is null;

create index if not exists matches_league_id_idx
  on public.matches (league_id)
  where deleted_at is null;

create index if not exists matches_group_id_idx
  on public.matches (group_id)
  where deleted_at is null;

create index if not exists matches_scheduled_at_idx
  on public.matches (scheduled_at)
  where deleted_at is null;

create index if not exists match_results_match_id_idx
  on public.match_results (match_id)
  where deleted_at is null;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

drop trigger if exists match_results_set_updated_at on public.match_results;
create trigger match_results_set_updated_at
  before update on public.match_results
  for each row execute function public.set_updated_at();

drop trigger if exists matches_audit on public.matches;
create trigger matches_audit
  after insert or update or delete on public.matches
  for each row execute function public.audit_row_change();

drop trigger if exists match_results_audit on public.match_results;
create trigger match_results_audit
  after insert or update or delete on public.match_results
  for each row execute function public.audit_row_change();

alter table public.matches enable row level security;
alter table public.match_results enable row level security;

drop policy if exists "Anyone can view active matches" on public.matches;
create policy "Anyone can view active matches"
  on public.matches for select
  using (deleted_at is null);

drop policy if exists "Anyone can view active match results" on public.match_results;
create policy "Anyone can view active match results"
  on public.match_results for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage matches" on public.matches;
create policy "Moderators can manage matches"
  on public.matches for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Moderators can manage match results" on public.match_results;
create policy "Moderators can manage match results"
  on public.match_results for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.matches to anon, authenticated;
grant select, insert, update, delete on public.match_results to anon, authenticated;
grant all privileges on public.matches to service_role;
grant all privileges on public.match_results to service_role;

notify pgrst, 'reload schema';
