create table if not exists public.player_season_statistics (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  league_id uuid references public.leagues(id) on delete set null,
  group_id uuid references public.league_groups(id) on delete set null,
  team_id uuid references public.teams(id) on delete restrict,
  team_season_id uuid references public.team_seasons(id) on delete set null,
  player_id uuid not null references public.players(id) on delete restrict,
  played_matches integer not null default 0,
  won_matches integer not null default 0,
  lost_matches integer not null default 0,
  played_legs integer not null default 0,
  won_legs integer not null default 0,
  lost_legs integer not null default 0,
  score_95_plus integer not null default 0,
  score_133_plus integer not null default 0,
  score_171_plus integer not null default 0,
  checkout_100_plus integer not null default 0,
  source_label text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint player_season_statistics_match_counts_valid check (played_matches = won_matches + lost_matches),
  constraint player_season_statistics_leg_counts_valid check (played_legs = won_legs + lost_legs),
  constraint player_season_statistics_counts_non_negative check (
    played_matches >= 0
    and won_matches >= 0
    and lost_matches >= 0
    and played_legs >= 0
    and won_legs >= 0
    and lost_legs >= 0
    and score_95_plus >= 0
    and score_133_plus >= 0
    and score_171_plus >= 0
    and checkout_100_plus >= 0
  )
);

create unique index if not exists player_season_statistics_scope_player_uidx
  on public.player_season_statistics (season_id, league_id, group_id, player_id)
  where deleted_at is null;

create index if not exists player_season_statistics_season_group_idx
  on public.player_season_statistics (season_id, league_id, group_id)
  where deleted_at is null;

create index if not exists player_season_statistics_team_season_idx
  on public.player_season_statistics (team_season_id)
  where deleted_at is null;

drop trigger if exists player_season_statistics_set_updated_at on public.player_season_statistics;
create trigger player_season_statistics_set_updated_at
  before update on public.player_season_statistics
  for each row execute function public.set_updated_at();

drop trigger if exists player_season_statistics_audit on public.player_season_statistics;
create trigger player_season_statistics_audit
  after insert or update or delete on public.player_season_statistics
  for each row execute function public.audit_row_change();

alter table public.player_season_statistics enable row level security;

drop policy if exists "Anyone can view active player season statistics" on public.player_season_statistics;
create policy "Anyone can view active player season statistics"
  on public.player_season_statistics for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage player season statistics" on public.player_season_statistics;
create policy "Moderators can manage player season statistics"
  on public.player_season_statistics for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant select on public.player_season_statistics to anon, authenticated;
grant select, insert, update, delete on public.player_season_statistics to authenticated;
grant all privileges on public.player_season_statistics to service_role;
