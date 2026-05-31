-- Run this once in Supabase Dashboard > SQL Editor if /admin/matches/[id]
-- says that official match sheet tables are missing.

do $$
begin
  create type public.match_game_type as enum ('singles', 'doubles', 'cricket', 'tiebreak_701');
exception
  when duplicate_object then null;
end $$;

alter type public.match_game_type add value if not exists 'singles';
alter type public.match_game_type add value if not exists 'tiebreak_701';

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
  constraint match_games_legs_non_negative check (home_legs >= 0 and away_legs >= 0)
);

alter table public.match_games
  add column if not exists winner_side public.match_side;

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

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_games'
      and column_name = 'winner'
  ) then
    execute 'update public.match_games set winner_side = winner where winner_side is null';
  end if;
end $$;

do $$
begin
  if to_regclass('public.match_achievements') is not null then
    insert into public.match_game_achievements (
      id,
      match_id,
      match_game_id,
      player_id,
      achievement_type,
      achievement_count,
      created_at,
      updated_at,
      deleted_at
    )
    select
      id,
      match_id,
      match_game_id,
      player_id,
      achievement_type,
      achievement_count,
      created_at,
      updated_at,
      deleted_at
    from public.match_achievements
    where match_game_id is not null
    on conflict (id) do nothing;
  end if;
end $$;

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

drop trigger if exists match_games_set_updated_at on public.match_games;
create trigger match_games_set_updated_at
  before update on public.match_games
  for each row execute function public.set_updated_at();

drop trigger if exists match_game_players_set_updated_at on public.match_game_players;
create trigger match_game_players_set_updated_at
  before update on public.match_game_players
  for each row execute function public.set_updated_at();

drop trigger if exists match_game_achievements_set_updated_at on public.match_game_achievements;
create trigger match_game_achievements_set_updated_at
  before update on public.match_game_achievements
  for each row execute function public.set_updated_at();

drop trigger if exists match_games_audit on public.match_games;
create trigger match_games_audit
  after insert or update or delete on public.match_games
  for each row execute function public.audit_row_change();

drop trigger if exists match_game_players_audit on public.match_game_players;
create trigger match_game_players_audit
  after insert or update or delete on public.match_game_players
  for each row execute function public.audit_row_change();

drop trigger if exists match_game_achievements_audit on public.match_game_achievements;
create trigger match_game_achievements_audit
  after insert or update or delete on public.match_game_achievements
  for each row execute function public.audit_row_change();

alter table public.match_games enable row level security;
alter table public.match_game_players enable row level security;
alter table public.match_game_achievements enable row level security;

drop policy if exists "Anyone can view active match games" on public.match_games;
create policy "Anyone can view active match games"
  on public.match_games for select
  using (deleted_at is null);

drop policy if exists "Anyone can view active match game players" on public.match_game_players;
create policy "Anyone can view active match game players"
  on public.match_game_players for select
  using (deleted_at is null);

drop policy if exists "Anyone can view active match game achievements" on public.match_game_achievements;
create policy "Anyone can view active match game achievements"
  on public.match_game_achievements for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage match games" on public.match_games;
create policy "Moderators can manage match games"
  on public.match_games for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Moderators can manage match game players" on public.match_game_players;
create policy "Moderators can manage match game players"
  on public.match_game_players for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Moderators can manage match game achievements" on public.match_game_achievements;
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

-- Convert the early generic match-sheet order to the official ZSS paper form.
-- Existing rows are moved through a temporary range to avoid active-order collisions.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.match_games'::regclass
      and conname = 'match_games_order_valid'
      and pg_get_constraintdef(oid) like '%21%'
  ) then
    alter table public.match_games
      drop constraint if exists match_games_order_valid,
      drop constraint if exists match_games_type_order_valid;

    update public.match_games
    set order_number = order_number + 100
    where deleted_at is null;

    update public.match_games
    set order_number = case
      when game_type = 'singles' and order_number between 101 and 108 then order_number - 100
      when game_type = 'singles' and order_number between 109 and 118 then order_number - 98
      when game_type = 'doubles' then 9
      when game_type = 'cricket' then 10
      when game_type = 'tiebreak_701' then 19
      else order_number - 100
    end
    where deleted_at is null;
  end if;
end $$;

alter table public.match_games
  drop constraint if exists match_games_single_order_valid,
  drop constraint if exists match_games_singles_order_valid,
  drop constraint if exists match_games_doubles_order_valid,
  drop constraint if exists match_games_cricket_order_valid,
  drop constraint if exists match_games_tiebreak_order_valid,
  drop constraint if exists match_games_order_valid,
  drop constraint if exists match_games_type_order_valid,
  add constraint match_games_order_valid check (order_number between 1 and 19),
  add constraint match_games_type_order_valid check (
    (game_type = 'singles' and (order_number between 1 and 8 or order_number between 11 and 18))
    or (game_type = 'doubles' and order_number = 9)
    or (game_type = 'cricket' and order_number = 10)
    or (game_type = 'tiebreak_701' and order_number = 19)
  );

notify pgrst, 'reload schema';

create table if not exists public.match_player_slots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  side public.match_side not null,
  slot_code text not null,
  player_id uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_player_slots_code_valid check (
    (side = 'home' and slot_code in ('1', '2', '3', '4'))
    or (side = 'away' and slot_code in ('A', 'B', 'C', 'D'))
  )
);

alter table public.match_game_players
  add column if not exists slot_code text;

alter table public.match_game_players
  drop constraint if exists match_game_players_slot_code_valid;

alter table public.match_game_players
  add constraint match_game_players_slot_code_valid check (
    slot_code is null
    or (side = 'home' and slot_code in ('1', '2', '3', '4'))
    or (side = 'away' and slot_code in ('A', 'B', 'C', 'D'))
  );

create unique index if not exists match_player_slots_slot_active_uidx
  on public.match_player_slots (match_id, side, slot_code)
  where deleted_at is null;

create unique index if not exists match_player_slots_player_active_uidx
  on public.match_player_slots (match_id, side, player_id)
  where deleted_at is null;

create index if not exists match_player_slots_match_id_idx
  on public.match_player_slots (match_id)
  where deleted_at is null;

drop trigger if exists match_player_slots_set_updated_at on public.match_player_slots;
create trigger match_player_slots_set_updated_at
  before update on public.match_player_slots
  for each row execute function public.set_updated_at();

drop trigger if exists match_player_slots_audit on public.match_player_slots;
create trigger match_player_slots_audit
  after insert or update or delete on public.match_player_slots
  for each row execute function public.audit_row_change();

alter table public.match_player_slots enable row level security;

drop policy if exists "Anyone can view active match player slots" on public.match_player_slots;
create policy "Anyone can view active match player slots"
  on public.match_player_slots for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage match player slots" on public.match_player_slots;
create policy "Moderators can manage match player slots"
  on public.match_player_slots for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant select, insert, update, delete on public.match_player_slots to anon, authenticated;
grant all privileges on public.match_player_slots to service_role;

-- Seed slots from older saved singles when possible.
with singles_pairs(order_number, home_slot, away_slot) as (
  values
    (1, '1', 'A'), (2, '2', 'B'), (3, '3', 'C'), (4, '4', 'D'),
    (5, '1', 'B'), (6, '2', 'C'), (7, '3', 'D'), (8, '4', 'A'),
    (11, '1', 'C'), (12, '2', 'D'), (13, '3', 'A'), (14, '4', 'B'),
    (15, '1', 'D'), (16, '2', 'A'), (17, '3', 'B'), (18, '4', 'C')
),
slot_candidates as (
  select
    games.match_id,
    players.side,
    case when players.side = 'home' then pairs.home_slot else pairs.away_slot end as slot_code,
    players.player_id,
    row_number() over (
      partition by games.match_id, players.side, players.player_id
      order by games.order_number
    ) as player_slot_rank
  from public.match_games games
  join singles_pairs pairs on pairs.order_number = games.order_number
  join public.match_game_players players on players.match_game_id = games.id
  where games.game_type = 'singles'
    and games.deleted_at is null
    and players.deleted_at is null
),
unique_candidates as (
  select distinct on (match_id, side, slot_code)
    match_id,
    side,
    slot_code,
    player_id
  from slot_candidates
  where player_slot_rank = 1
  order by match_id, side, slot_code
)
insert into public.match_player_slots (match_id, side, slot_code, player_id)
select candidate.match_id, candidate.side, candidate.slot_code, candidate.player_id
from unique_candidates candidate
where not exists (
  select 1
  from public.match_player_slots existing
  where existing.match_id = candidate.match_id
    and existing.side = candidate.side
    and existing.slot_code = candidate.slot_code
    and existing.deleted_at is null
);

notify pgrst, 'reload schema';
