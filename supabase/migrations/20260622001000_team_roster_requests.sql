alter table public.teams
  add column if not exists public_description text,
  add column if not exists public_contact_email text,
  add column if not exists website_url text;

create table if not exists public.team_roster_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  team_season_id uuid not null references public.team_seasons(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_player_name text not null,
  requested_player_email text,
  requested_player_note text,
  status text not null default 'pending',
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint team_roster_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint team_roster_requests_player_name_not_blank check (length(trim(requested_player_name)) > 0)
);

create index if not exists team_roster_requests_status_idx
  on public.team_roster_requests (status, created_at desc)
  where deleted_at is null;

create index if not exists team_roster_requests_team_season_idx
  on public.team_roster_requests (team_season_id, created_at desc)
  where deleted_at is null;

create index if not exists team_roster_requests_requested_by_idx
  on public.team_roster_requests (requested_by_user_id, created_at desc)
  where deleted_at is null;

drop trigger if exists team_roster_requests_set_updated_at on public.team_roster_requests;
create trigger team_roster_requests_set_updated_at
  before update on public.team_roster_requests
  for each row execute function public.set_updated_at();

drop trigger if exists team_roster_requests_audit on public.team_roster_requests;
create trigger team_roster_requests_audit
  after insert or update or delete on public.team_roster_requests
  for each row execute function public.audit_row_change();

alter table public.team_roster_requests enable row level security;

drop policy if exists "Captains can view own roster requests" on public.team_roster_requests;
create policy "Captains can view own roster requests"
  on public.team_roster_requests for select
  to authenticated
  using (requested_by_user_id = auth.uid());

drop policy if exists "Captains can create own roster requests" on public.team_roster_requests;
create policy "Captains can create own roster requests"
  on public.team_roster_requests for insert
  to authenticated
  with check (requested_by_user_id = auth.uid());

drop policy if exists "Admins can manage roster requests" on public.team_roster_requests;
create policy "Admins can manage roster requests"
  on public.team_roster_requests for all
  to authenticated
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

grant select, insert on public.team_roster_requests to authenticated;
grant select, insert, update, delete on public.team_roster_requests to service_role;
grant all privileges on public.team_roster_requests to service_role;

insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values ('roster-requests', '/admin/roster-requests', 'Žádosti soupisky', 'moderator')
on conflict (page_key) do update
set page_path = excluded.page_path,
    page_label = excluded.page_label,
    minimum_role = excluded.minimum_role,
    updated_at = now();
