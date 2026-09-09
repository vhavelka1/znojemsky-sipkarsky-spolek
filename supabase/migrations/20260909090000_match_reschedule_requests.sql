do $$
begin
  if to_regtype('public.match_reschedule_request_status') is null then
    create type public.match_reschedule_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_player_id uuid references public.players(id) on delete restrict,
  requested_by_side public.match_side,
  current_scheduled_at timestamptz not null,
  requested_scheduled_at timestamptz not null,
  reason text not null,
  status public.match_reschedule_request_status not null default 'pending',
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists match_reschedule_requests_pending_match_uidx
  on public.match_reschedule_requests (match_id)
  where status = 'pending' and deleted_at is null;

create index if not exists match_reschedule_requests_match_id_idx
  on public.match_reschedule_requests (match_id)
  where deleted_at is null;

create index if not exists match_reschedule_requests_status_idx
  on public.match_reschedule_requests (status, created_at)
  where deleted_at is null;

drop trigger if exists match_reschedule_requests_set_updated_at on public.match_reschedule_requests;
create trigger match_reschedule_requests_set_updated_at
  before update on public.match_reschedule_requests
  for each row execute function public.set_updated_at();

drop trigger if exists match_reschedule_requests_audit on public.match_reschedule_requests;
create trigger match_reschedule_requests_audit
  after insert or update or delete on public.match_reschedule_requests
  for each row execute function public.audit_row_change();

alter table public.match_reschedule_requests enable row level security;

drop policy if exists "Moderators can manage match reschedule requests" on public.match_reschedule_requests;
create policy "Moderators can manage match reschedule requests"
  on public.match_reschedule_requests for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Captains can view own match reschedule requests" on public.match_reschedule_requests;
create policy "Captains can view own match reschedule requests"
  on public.match_reschedule_requests for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id in (matched.home_team_id, matched.away_team_id)
      join public.players player on player.id = membership.player_id
      where matched.id = match_id
        and matched.deleted_at is null
        and membership.member_role in ('captain', 'assistant_captain')
        and membership.left_on is null
        and membership.deleted_at is null
        and player.user_id = auth.uid()
    )
  );

drop policy if exists "Captains can create own match reschedule requests" on public.match_reschedule_requests;
create policy "Captains can create own match reschedule requests"
  on public.match_reschedule_requests for insert
  with check (
    status = 'pending'
    and reviewed_by_user_id is null
    and reviewed_at is null
    and deleted_at is null
    and exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id in (matched.home_team_id, matched.away_team_id)
      join public.players player on player.id = membership.player_id
      where matched.id = match_id
        and matched.deleted_at is null
        and membership.player_id = requested_by_player_id
        and membership.member_role in ('captain', 'assistant_captain')
        and membership.left_on is null
        and membership.deleted_at is null
        and player.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.match_reschedule_requests to anon, authenticated;
grant all privileges on public.match_reschedule_requests to service_role;

insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values ('match-reschedule-requests', '/admin/match-reschedule-requests', 'Žádosti termínů', 'moderator')
on conflict (page_key) do update
set
  page_path = excluded.page_path,
  page_label = excluded.page_label;

notify pgrst, 'reload schema';
