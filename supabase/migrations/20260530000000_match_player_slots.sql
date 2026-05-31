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
