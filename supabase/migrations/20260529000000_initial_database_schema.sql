-- Initial Supabase schema for Znojemsky sipkarsky spolek.
-- PostgreSQL schema with UUID primary keys, soft deletes, audit logging,
-- relationships, indexes, foreign keys, and RLS policies.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'guest',
  'player',
  'captain',
  'moderator',
  'admin'
);

create type public.membership_role as enum (
  'player',
  'captain'
);

create type public.transfer_status as enum (
  'requested',
  'approved',
  'rejected',
  'cancelled'
);

create type public.tournament_status as enum (
  'scheduled',
  'completed',
  'cancelled'
);

create type public.payment_status as enum (
  'pending',
  'paid',
  'cancelled',
  'refunded'
);

create type public.payment_type as enum (
  'membership_fee',
  'tournament_fee',
  'team_fee',
  'penalty',
  'other'
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  transfer_deadline_on date not null,
  transfer_wait_days integer not null default 14,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint seasons_dates_valid check (starts_on < ends_on),
  constraint seasons_transfer_deadline_valid check (
    transfer_deadline_on >= starts_on
    and transfer_deadline_on <= ends_on
  ),
  constraint seasons_transfer_wait_days_non_negative check (transfer_wait_days >= 0)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  first_name text,
  last_name text,
  nickname text,
  email text,
  phone text,
  role public.app_role not null default 'player',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint players_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint teams_name_not_blank check (length(trim(name)) > 0),
  constraint teams_slug_not_blank check (length(trim(slug)) > 0)
);

create table public.team_seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  display_name text,
  home_venue text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint team_seasons_display_name_not_blank check (
    display_name is null
    or length(trim(display_name)) > 0
  )
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  team_season_id uuid not null references public.team_seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  member_role public.membership_role not null default 'player',
  joined_on date not null default current_date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint team_memberships_dates_valid check (left_on is null or left_on >= joined_on)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  from_team_season_id uuid references public.team_seasons(id) on delete restrict,
  to_team_season_id uuid not null references public.team_seasons(id) on delete restrict,
  requested_by_player_id uuid references public.players(id) on delete set null,
  approved_by_player_id uuid references public.players(id) on delete set null,
  status public.transfer_status not null default 'requested',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  effective_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transfers_distinct_teams check (
    from_team_season_id is null
    or from_team_season_id <> to_team_season_id
  ),
  constraint transfers_decision_consistency check (
    (status in ('approved', 'rejected', 'cancelled') and decided_at is not null)
    or (status = 'requested' and decided_at is null)
  )
);

create table public.tournament_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  scoring_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tournament_types_name_not_blank check (length(trim(name)) > 0),
  constraint tournament_types_slug_not_blank check (length(trim(slug)) > 0),
  constraint tournament_types_scoring_is_object check (jsonb_typeof(scoring_config) = 'object')
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  tournament_type_id uuid not null references public.tournament_types(id) on delete restrict,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  status public.tournament_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tournaments_name_not_blank check (length(trim(name)) > 0),
  constraint tournaments_dates_valid check (ends_at is null or ends_at >= starts_at)
);

create table public.ranking_points (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  tournament_id uuid references public.tournaments(id) on delete set null,
  player_id uuid not null references public.players(id) on delete restrict,
  points integer not null,
  placement integer,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ranking_points_non_negative check (points >= 0),
  constraint ranking_points_placement_positive check (placement is null or placement > 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  team_season_id uuid references public.team_seasons(id) on delete set null,
  amount numeric(12, 2) not null,
  currency char(3) not null default 'CZK',
  payment_type public.payment_type not null,
  status public.payment_status not null default 'pending',
  due_on date,
  paid_at timestamptz,
  external_reference text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payments_amount_positive check (amount > 0),
  constraint payments_currency_uppercase check (currency = upper(currency)),
  constraint payments_paid_consistency check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid')
  )
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_player_id uuid references public.players(id) on delete set null,
  action text not null,
  table_name text not null,
  row_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint audit_logs_action_valid check (action in ('INSERT', 'UPDATE', 'DELETE'))
);

-- Relationships and uniqueness constraints.
create unique index seasons_name_active_uidx
  on public.seasons (lower(name))
  where deleted_at is null;

create unique index seasons_single_active_uidx
  on public.seasons (is_active)
  where is_active = true and deleted_at is null;

create unique index teams_slug_active_uidx
  on public.teams (lower(slug))
  where deleted_at is null;

create unique index teams_name_active_uidx
  on public.teams (lower(name))
  where deleted_at is null;

create unique index team_seasons_team_season_active_uidx
  on public.team_seasons (team_id, season_id)
  where deleted_at is null;

create unique index team_seasons_display_name_active_uidx
  on public.team_seasons (season_id, lower(display_name))
  where display_name is not null and deleted_at is null;

create unique index team_memberships_active_player_season_uidx
  on public.team_memberships (season_id, player_id)
  where left_on is null and deleted_at is null;

create unique index team_memberships_active_team_captain_uidx
  on public.team_memberships (team_season_id)
  where member_role = 'captain' and left_on is null and deleted_at is null;

create unique index tournament_types_slug_active_uidx
  on public.tournament_types (lower(slug))
  where deleted_at is null;

create unique index ranking_points_tournament_player_active_uidx
  on public.ranking_points (tournament_id, player_id)
  where tournament_id is not null and deleted_at is null;

-- Performance indexes for foreign keys, RLS predicates, and common lists.
create index seasons_active_idx on public.seasons (is_active) where deleted_at is null;
create index players_user_id_idx on public.players (user_id) where deleted_at is null;
create index players_role_idx on public.players (role) where deleted_at is null;
create index team_seasons_team_id_idx on public.team_seasons (team_id) where deleted_at is null;
create index team_seasons_season_id_idx on public.team_seasons (season_id) where deleted_at is null;
create index team_seasons_season_active_idx on public.team_seasons (season_id, is_active) where deleted_at is null;
create index team_memberships_team_season_id_idx on public.team_memberships (team_season_id) where deleted_at is null;
create index team_memberships_player_id_idx on public.team_memberships (player_id) where deleted_at is null;
create index team_memberships_season_team_season_idx on public.team_memberships (season_id, team_season_id) where deleted_at is null;
create index transfers_player_id_idx on public.transfers (player_id) where deleted_at is null;
create index transfers_season_status_idx on public.transfers (season_id, status) where deleted_at is null;
create index transfers_from_team_season_id_idx on public.transfers (from_team_season_id) where deleted_at is null;
create index transfers_to_team_season_id_idx on public.transfers (to_team_season_id) where deleted_at is null;
create index tournaments_season_id_idx on public.tournaments (season_id) where deleted_at is null;
create index tournaments_type_id_idx on public.tournaments (tournament_type_id) where deleted_at is null;
create index tournaments_starts_at_idx on public.tournaments (starts_at) where deleted_at is null;
create index ranking_points_season_player_idx on public.ranking_points (season_id, player_id) where deleted_at is null;
create index ranking_points_tournament_id_idx on public.ranking_points (tournament_id) where deleted_at is null;
create index payments_player_status_idx on public.payments (player_id, status) where deleted_at is null;
create index payments_team_season_id_idx on public.payments (team_season_id) where deleted_at is null;
create index payments_due_on_idx on public.payments (due_on) where deleted_at is null;
create index audit_logs_table_row_idx on public.audit_logs (table_name, row_id);
create index audit_logs_actor_user_idx on public.audit_logs (actor_user_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.players p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() = 'anon' then 'guest'::public.app_role
    else coalesce(
      (
        select p.role
        from public.players p
        where p.user_id = auth.uid()
          and p.deleted_at is null
          and p.is_active = true
        limit 1
      ),
      'guest'::public.app_role
    )
  end
$$;

create or replace function public.has_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = any(allowed_roles)
$$;

create or replace function public.is_team_season_captain(check_team_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_season_id = check_team_season_id
      and tm.player_id = public.current_player_id()
      and tm.member_role = 'captain'
      and tm.left_on is null
      and tm.deleted_at is null
  )
$$;

create or replace function public.is_team_season_member(check_team_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_season_id = check_team_season_id
      and tm.player_id = public.current_player_id()
      and tm.left_on is null
      and tm.deleted_at is null
  )
$$;

create or replace function public.prevent_player_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and (
      new.role is distinct from old.role
      or new.user_id is distinct from old.user_id
    )
    and not public.has_role(array['moderator', 'admin']::public.app_role[])
  then
    raise exception 'Only moderators and admins can change player role or user account';
  end if;

  return new;
end;
$$;

create or replace function public.validate_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.team_seasons ts
    where ts.id = new.team_season_id
      and ts.season_id = new.season_id
      and ts.deleted_at is null
  ) then
    raise exception 'Team membership must reference a team participation in the same season';
  end if;

  return new;
end;
$$;

create or replace function public.validate_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  season_transfer_deadline date;
  season_transfer_wait_days integer;
  earliest_effective_on date;
begin
  select s.transfer_deadline_on, s.transfer_wait_days
  into season_transfer_deadline, season_transfer_wait_days
  from public.seasons s
  where s.id = new.season_id
    and s.deleted_at is null;

  if season_transfer_deadline is null then
    raise exception 'Transfer season does not exist or is deleted';
  end if;

  if new.status in ('requested', 'approved') and new.effective_on > season_transfer_deadline then
    raise exception 'Transfers are allowed only until the season transfer deadline';
  end if;

  if not exists (
    select 1
    from public.team_seasons ts
    where ts.id = new.to_team_season_id
      and ts.season_id = new.season_id
      and ts.deleted_at is null
  ) then
    raise exception 'Destination team must participate in the transfer season';
  end if;

  if new.from_team_season_id is not null and not exists (
    select 1
    from public.team_seasons ts
    where ts.id = new.from_team_season_id
      and ts.season_id = new.season_id
      and ts.deleted_at is null
  ) then
    raise exception 'Source team must participate in the transfer season';
  end if;

  if new.status in ('requested', 'approved') and season_transfer_wait_days > 0 then
    select max(t.effective_on + season_transfer_wait_days)
    into earliest_effective_on
    from public.transfers t
    where t.player_id = new.player_id
      and t.season_id = new.season_id
      and t.status = 'approved'
      and t.deleted_at is null
      and (tg_op = 'INSERT' or t.id <> new.id);

    if earliest_effective_on is not null and new.effective_on < earliest_effective_on then
      raise exception 'Player must wait % days between approved transfers', season_transfer_wait_days;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_season_id is not null and not exists (
    select 1
    from public.team_seasons ts
    where ts.id = new.team_season_id
      and ts.season_id is not distinct from new.season_id
      and ts.deleted_at is null
  ) then
    raise exception 'Payment team participation must belong to the payment season';
  end if;

  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_row_id uuid;
begin
  changed_row_id = coalesce(new.id, old.id);

  insert into public.audit_logs (
    actor_user_id,
    actor_player_id,
    action,
    table_name,
    row_id,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    public.current_player_id(),
    tg_op,
    tg_table_name,
    changed_row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger team_seasons_set_updated_at
  before update on public.team_seasons
  for each row execute function public.set_updated_at();

create trigger team_memberships_set_updated_at
  before update on public.team_memberships
  for each row execute function public.set_updated_at();

create trigger transfers_set_updated_at
  before update on public.transfers
  for each row execute function public.set_updated_at();

create trigger tournament_types_set_updated_at
  before update on public.tournament_types
  for each row execute function public.set_updated_at();

create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row execute function public.set_updated_at();

create trigger ranking_points_set_updated_at
  before update on public.ranking_points
  for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger audit_logs_set_updated_at
  before update on public.audit_logs
  for each row execute function public.set_updated_at();

create trigger players_prevent_role_escalation
  before update on public.players
  for each row execute function public.prevent_player_role_escalation();

create trigger team_memberships_validate
  before insert or update on public.team_memberships
  for each row execute function public.validate_team_membership();

create trigger transfers_validate
  before insert or update on public.transfers
  for each row execute function public.validate_transfer();

create trigger payments_validate
  before insert or update on public.payments
  for each row execute function public.validate_payment();

create trigger seasons_audit
  after insert or update or delete on public.seasons
  for each row execute function public.audit_row_change();

create trigger players_audit
  after insert or update or delete on public.players
  for each row execute function public.audit_row_change();

create trigger teams_audit
  after insert or update or delete on public.teams
  for each row execute function public.audit_row_change();

create trigger team_seasons_audit
  after insert or update or delete on public.team_seasons
  for each row execute function public.audit_row_change();

create trigger team_memberships_audit
  after insert or update or delete on public.team_memberships
  for each row execute function public.audit_row_change();

create trigger transfers_audit
  after insert or update or delete on public.transfers
  for each row execute function public.audit_row_change();

create trigger tournament_types_audit
  after insert or update or delete on public.tournament_types
  for each row execute function public.audit_row_change();

create trigger tournaments_audit
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_row_change();

create trigger ranking_points_audit
  after insert or update or delete on public.ranking_points
  for each row execute function public.audit_row_change();

create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();

alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.team_seasons enable row level security;
alter table public.team_memberships enable row level security;
alter table public.transfers enable row level security;
alter table public.tournament_types enable row level security;
alter table public.tournaments enable row level security;
alter table public.ranking_points enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

-- Public read policies for non-sensitive, non-deleted records.
create policy "Anyone can view active seasons"
  on public.seasons for select
  using (deleted_at is null);

create policy "Anyone can view active teams"
  on public.teams for select
  using (deleted_at is null);

create policy "Anyone can view active team seasons"
  on public.team_seasons for select
  using (deleted_at is null);

create policy "Anyone can view active players"
  on public.players for select
  using (deleted_at is null and is_active = true);

create policy "Anyone can view active team memberships"
  on public.team_memberships for select
  using (deleted_at is null);

create policy "Anyone can view active tournament types"
  on public.tournament_types for select
  using (deleted_at is null);

create policy "Anyone can view active tournaments"
  on public.tournaments for select
  using (deleted_at is null);

create policy "Anyone can view active ranking points"
  on public.ranking_points for select
  using (deleted_at is null);

-- Admin and moderator write access to reference and public competition data.
create policy "Moderators can manage seasons"
  on public.seasons for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage teams"
  on public.teams for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage team seasons"
  on public.team_seasons for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage tournament types"
  on public.tournament_types for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage tournaments"
  on public.tournaments for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Moderators can manage ranking points"
  on public.ranking_points for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

-- Players can create and maintain their own profile, without changing role/user_id.
create policy "Authenticated users can create own player profile"
  on public.players for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and role = 'player'
    and deleted_at is null
  );

create policy "Players can update own profile"
  on public.players for update
  using (id = public.current_player_id() and deleted_at is null)
  with check (id = public.current_player_id() and deleted_at is null);

create policy "Moderators can manage players"
  on public.players for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

-- Captains can manage non-captain memberships for their team.
create policy "Captains can manage team player memberships"
  on public.team_memberships for all
  using (
    public.is_team_season_captain(team_season_id)
    and member_role = 'player'
  )
  with check (
    public.is_team_season_captain(team_season_id)
    and member_role = 'player'
  );

create policy "Moderators can manage team memberships"
  on public.team_memberships for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

-- Transfer visibility and workflow.
create policy "Players can view own transfers"
  on public.transfers for select
  using (
    deleted_at is null
    and (
      player_id = public.current_player_id()
      or public.is_team_season_member(from_team_season_id)
      or public.is_team_season_member(to_team_season_id)
      or public.has_role(array['moderator', 'admin']::public.app_role[])
    )
  );

create policy "Players can request own transfers"
  on public.transfers for insert
  with check (
    deleted_at is null
    and status = 'requested'
    and player_id = public.current_player_id()
    and requested_by_player_id = public.current_player_id()
  );

create policy "Captains can request transfers to own team"
  on public.transfers for insert
  with check (
    deleted_at is null
    and status = 'requested'
    and public.is_team_season_captain(to_team_season_id)
  );

create policy "Captains can decide incoming transfers"
  on public.transfers for update
  using (
    deleted_at is null
    and public.is_team_season_captain(to_team_season_id)
  )
  with check (
    deleted_at is null
    and status in ('approved', 'rejected', 'cancelled')
    and public.is_team_season_captain(to_team_season_id)
  );

create policy "Moderators can manage transfers"
  on public.transfers for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

-- Payments are private to the player, relevant captain, and staff.
create policy "Players can view own payments"
  on public.payments for select
  using (
    deleted_at is null
    and (
      player_id = public.current_player_id()
      or public.is_team_season_captain(team_season_id)
      or public.has_role(array['moderator', 'admin']::public.app_role[])
    )
  );

create policy "Moderators can manage payments"
  on public.payments for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

-- Audit logs are readable only by staff. Inserts are performed by security-definer triggers.
create policy "Moderators can view audit logs"
  on public.audit_logs for select
  using (public.has_role(array['moderator', 'admin']::public.app_role[]));

create policy "Admins can manage audit logs"
  on public.audit_logs for all
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

-- Supabase PostgREST grants. RLS still controls anon/authenticated access.
-- The server-only admin API uses service_role, which bypasses RLS but still
-- needs explicit table privileges when tables are created by migrations.
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on routines to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;

grant select on public.seasons to anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.team_seasons to anon, authenticated;
grant select on public.team_memberships to anon, authenticated;
grant select on public.tournament_types to anon, authenticated;
grant select on public.tournaments to anon, authenticated;
grant select on public.ranking_points to anon, authenticated;

grant insert, update on public.players to authenticated;
