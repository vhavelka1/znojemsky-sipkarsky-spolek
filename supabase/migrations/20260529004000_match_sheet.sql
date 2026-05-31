do $$
begin
  create type public.match_game_type as enum ('singles', 'doubles', 'cricket', 'tiebreak_701');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_side as enum ('home', 'away');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_achievement_type as enum ('score_95_plus', 'score_133_plus', 'score_171_plus', 'checkout_100_plus');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  game_type public.match_game_type not null,
  order_number integer not null,
  home_legs integer not null default 0,
  away_legs integer not null default 0,
  winner_side public.match_side,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_games_order_valid check (order_number between 1 and 21),
  constraint match_games_legs_non_negative check (home_legs >= 0 and away_legs >= 0),
  constraint match_games_type_order_valid check (
    (game_type = 'singles' and order_number between 1 and 18)
    or (game_type = 'doubles' and order_number = 19)
    or (game_type = 'cricket' and order_number = 20)
    or (game_type = 'tiebreak_701' and order_number = 21)
  )
);

create table if not exists public.match_game_players (
  id uuid primary key default gen_random_uuid(),
  match_game_id uuid not null references public.match_games(id) on delete restrict,
  side public.match_side not null,
  player_id uuid not null references public.players(id) on delete restrict,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_game_players_position_valid check (position in (1, 2))
);

create table if not exists public.match_game_achievements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  match_game_id uuid not null references public.match_games(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  achievement_type public.match_achievement_type not null,
  achievement_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_game_achievements_count_positive check (achievement_count > 0)
);

create unique index if not exists match_games_match_order_active_uidx
  on public.match_games (match_id, order_number)
  where deleted_at is null;

create unique index if not exists match_game_players_slot_active_uidx
  on public.match_game_players (match_game_id, side, position)
  where deleted_at is null;

create index if not exists match_game_players_player_id_idx
  on public.match_game_players (player_id)
  where deleted_at is null;

create index if not exists match_game_achievements_match_id_idx
  on public.match_game_achievements (match_id)
  where deleted_at is null;

create index if not exists match_game_achievements_player_id_idx
  on public.match_game_achievements (player_id)
  where deleted_at is null;

create trigger match_games_set_updated_at
  before update on public.match_games
  for each row execute function public.set_updated_at();

create trigger match_game_players_set_updated_at
  before update on public.match_game_players
  for each row execute function public.set_updated_at();

create trigger match_game_achievements_set_updated_at
  before update on public.match_game_achievements
  for each row execute function public.set_updated_at();

create trigger match_games_audit
  after insert or update or delete on public.match_games
  for each row execute function public.audit_row_change();

create trigger match_game_players_audit
  after insert or update or delete on public.match_game_players
  for each row execute function public.audit_row_change();

create trigger match_game_achievements_audit
  after insert or update or delete on public.match_game_achievements
  for each row execute function public.audit_row_change();

alter table public.match_games enable row level security;
alter table public.match_game_players enable row level security;
alter table public.match_game_achievements enable row level security;

create policy "Anyone can view active match games"
  on public.match_games for select
  using (deleted_at is null);

create policy "Anyone can view active match game players"
  on public.match_game_players for select
  using (deleted_at is null);

create policy "Anyone can view active match game achievements"
  on public.match_game_achievements for select
  using (deleted_at is null);

create policy "Moderators can manage match games"
  on public.match_games for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage match game players"
  on public.match_game_players for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage match game achievements"
  on public.match_game_achievements for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.match_games to anon, authenticated;
grant select, insert, update, delete on public.match_game_players to anon, authenticated;
grant select, insert, update, delete on public.match_game_achievements to anon, authenticated;
grant all privileges on public.match_games to service_role;
grant all privileges on public.match_game_players to service_role;
grant all privileges on public.match_game_achievements to service_role;
