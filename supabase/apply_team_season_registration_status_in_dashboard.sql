alter table public.team_seasons
  add column if not exists registration_status text not null default 'draft',
  add column if not exists registration_submitted_at timestamptz,
  add column if not exists registration_reviewed_at timestamptz,
  add column if not exists registration_reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists registration_note text,
  add column if not exists registration_admin_note text;

alter table public.team_seasons
  drop constraint if exists team_seasons_registration_status_valid;

alter table public.team_seasons
  add constraint team_seasons_registration_status_valid
  check (registration_status in ('draft', 'submitted', 'approved', 'returned', 'cancelled'));

create index if not exists team_seasons_registration_status_idx
  on public.team_seasons (season_id, registration_status)
  where deleted_at is null;

notify pgrst, 'reload schema';
