-- Run this once in Supabase Dashboard > SQL Editor to enable Supabase Auth user management.

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  display_name text not null,
  app_role text not null default 'player',
  is_active boolean not null default true,
  must_use_mfa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_profiles_app_role_valid check (app_role in ('player', 'moderator', 'admin'))
);

create index if not exists user_profiles_user_active_idx
  on public.user_profiles (user_id)
  where deleted_at is null;

create index if not exists user_profiles_player_active_idx
  on public.user_profiles (player_id)
  where deleted_at is null;

create index if not exists user_profiles_role_active_idx
  on public.user_profiles (app_role)
  where deleted_at is null and is_active = true;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists user_profiles_audit on public.user_profiles;
create trigger user_profiles_audit
  after insert or update or delete on public.user_profiles
  for each row execute function public.audit_row_change();

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can manage user profiles" on public.user_profiles;
create policy "Admins can manage user profiles"
  on public.user_profiles for all
  using (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and profile.app_role = 'admin'
        and profile.is_active = true
        and profile.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and profile.app_role = 'admin'
        and profile.is_active = true
        and profile.deleted_at is null
    )
  );

grant usage on schema public to authenticated, service_role;
grant select on public.user_profiles to authenticated;
grant insert, update, delete on public.user_profiles to authenticated;
grant all privileges on public.user_profiles to service_role;
