-- Run this once in Supabase Dashboard > SQL Editor to enable captain confirmations.

alter type public.match_status add value if not exists 'awaiting_confirmation';
alter type public.match_status add value if not exists 'confirmed';

create table if not exists public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  side public.match_side not null,
  captain_player_id uuid not null references public.players(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists match_confirmations_match_side_active_uidx
  on public.match_confirmations (match_id, side)
  where deleted_at is null;

create index if not exists match_confirmations_match_id_idx
  on public.match_confirmations (match_id)
  where deleted_at is null;

create index if not exists match_confirmations_captain_player_id_idx
  on public.match_confirmations (captain_player_id)
  where deleted_at is null;

drop trigger if exists match_confirmations_set_updated_at on public.match_confirmations;
create trigger match_confirmations_set_updated_at
  before update on public.match_confirmations
  for each row execute function public.set_updated_at();

drop trigger if exists match_confirmations_audit on public.match_confirmations;
create trigger match_confirmations_audit
  after insert or update or delete on public.match_confirmations
  for each row execute function public.audit_row_change();

alter table public.match_confirmations enable row level security;

drop policy if exists "Anyone can view active match confirmations" on public.match_confirmations;
create policy "Anyone can view active match confirmations"
  on public.match_confirmations for select
  using (deleted_at is null);

drop policy if exists "Captains and moderators can manage match confirmations" on public.match_confirmations;
drop policy if exists "Moderators can manage match confirmations" on public.match_confirmations;
create policy "Captains and moderators can manage match confirmations"
  on public.match_confirmations for all
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
        and membership.player_id = captain_player_id
        and membership.member_role = 'captain'
        and membership.left_on is null
        and membership.deleted_at is null
        and player.user_id = auth.uid()
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
        and membership.player_id = captain_player_id
        and membership.member_role = 'captain'
        and membership.left_on is null
        and membership.deleted_at is null
        and player.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.match_confirmations to anon, authenticated;
grant all privileges on public.match_confirmations to service_role;

notify pgrst, 'reload schema';
