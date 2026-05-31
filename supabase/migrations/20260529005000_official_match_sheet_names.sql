alter type public.match_game_type add value if not exists 'singles';
alter type public.match_game_type add value if not exists 'tiebreak_701';

alter table if exists public.match_games
  add column if not exists winner_side public.match_side;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_games'
      and column_name = 'winner'
  ) then
    execute 'update public.match_games set winner_side = winner where winner_side is null';
  end if;
end $$;

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

create index if not exists match_game_achievements_match_id_idx
  on public.match_game_achievements (match_id)
  where deleted_at is null;

create index if not exists match_game_achievements_player_id_idx
  on public.match_game_achievements (player_id)
  where deleted_at is null;

drop trigger if exists match_game_achievements_set_updated_at on public.match_game_achievements;
create trigger match_game_achievements_set_updated_at
  before update on public.match_game_achievements
  for each row execute function public.set_updated_at();

drop trigger if exists match_game_achievements_audit on public.match_game_achievements;
create trigger match_game_achievements_audit
  after insert or update or delete on public.match_game_achievements
  for each row execute function public.audit_row_change();

alter table public.match_game_achievements enable row level security;

drop policy if exists "Anyone can view active match game achievements" on public.match_game_achievements;
create policy "Anyone can view active match game achievements"
  on public.match_game_achievements for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage match game achievements" on public.match_game_achievements;
create policy "Moderators can manage match game achievements"
  on public.match_game_achievements for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.match_game_achievements to anon, authenticated;
grant all privileges on public.match_game_achievements to service_role;
