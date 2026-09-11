create table if not exists public.match_block_lineup_reveals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  side public.match_side not null,
  block_number integer not null,
  revealed_by_player_id uuid references public.players(id) on delete set null,
  revealed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_block_lineup_reveals_block_valid check (block_number between 1 and 6)
);

create unique index if not exists match_block_lineup_reveals_active_uidx
  on public.match_block_lineup_reveals (match_id, side, block_number)
  where deleted_at is null;

create index if not exists match_block_lineup_reveals_match_idx
  on public.match_block_lineup_reveals (match_id)
  where deleted_at is null;

drop trigger if exists match_block_lineup_reveals_set_updated_at on public.match_block_lineup_reveals;
create trigger match_block_lineup_reveals_set_updated_at
  before update on public.match_block_lineup_reveals
  for each row execute function public.set_updated_at();

drop trigger if exists match_block_lineup_reveals_audit on public.match_block_lineup_reveals;
create trigger match_block_lineup_reveals_audit
  after insert or update or delete on public.match_block_lineup_reveals
  for each row execute function public.audit_row_change();

alter table public.match_block_lineup_reveals enable row level security;

drop policy if exists "Anyone can view active match block lineup reveals" on public.match_block_lineup_reveals;
create policy "Anyone can view active match block lineup reveals"
  on public.match_block_lineup_reveals for select
  using (deleted_at is null);

drop policy if exists "Captains and moderators can manage match block lineup reveals" on public.match_block_lineup_reveals;
create policy "Captains and moderators can manage match block lineup reveals"
  on public.match_block_lineup_reveals for all
  using (
    public.has_role(array['moderator', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id = case
          when side = 'home' then matched.home_team_id
          else matched.away_team_id
        end
      join public.players player on player.id = membership.player_id
      where matched.id = match_id
        and matched.deleted_at is null
        and membership.deleted_at is null
        and membership.left_on is null
        and membership.member_role in ('captain', 'assistant_captain')
        and player.user_id = auth.uid()
        and player.deleted_at is null
    )
  )
  with check (
    public.has_role(array['moderator', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id = case
          when side = 'home' then matched.home_team_id
          else matched.away_team_id
        end
      join public.players player on player.id = membership.player_id
      where matched.id = match_id
        and matched.deleted_at is null
        and membership.deleted_at is null
        and membership.left_on is null
        and membership.member_role in ('captain', 'assistant_captain')
        and player.user_id = auth.uid()
        and player.deleted_at is null
    )
  );

grant select, insert, update, delete on public.match_block_lineup_reveals to anon, authenticated;
grant all privileges on public.match_block_lineup_reveals to service_role;

notify pgrst, 'reload schema';
