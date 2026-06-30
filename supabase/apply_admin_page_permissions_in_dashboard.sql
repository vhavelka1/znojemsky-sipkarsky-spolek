create table if not exists public.admin_page_permissions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  page_path text not null,
  page_label text not null,
  minimum_role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint admin_page_permissions_minimum_role_valid check (minimum_role in ('player', 'moderator', 'admin'))
);

create index if not exists admin_page_permissions_active_idx
  on public.admin_page_permissions (page_key)
  where deleted_at is null;

drop trigger if exists admin_page_permissions_set_updated_at on public.admin_page_permissions;
create trigger admin_page_permissions_set_updated_at
  before update on public.admin_page_permissions
  for each row execute function public.set_updated_at();

drop trigger if exists admin_page_permissions_audit on public.admin_page_permissions;
create trigger admin_page_permissions_audit
  after insert or update or delete on public.admin_page_permissions
  for each row execute function public.audit_row_change();

alter table public.admin_page_permissions enable row level security;

drop policy if exists "Admins can manage admin page permissions" on public.admin_page_permissions;
create policy "Admins can manage admin page permissions"
  on public.admin_page_permissions for all
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

insert into public.admin_page_permissions (page_key, page_path, page_label, minimum_role)
values
  ('dashboard', '/admin', 'Přehled', 'moderator'),
  ('teams', '/admin/teams', 'Týmy', 'moderator'),
  ('rosters', '/admin/rosters', 'Soupisky', 'moderator'),
  ('players', '/admin/players', 'Hráči', 'moderator'),
  ('memberships', '/admin/memberships', 'Členství', 'moderator'),
  ('seasons', '/admin/seasons', 'Sezóny', 'admin'),
  ('leagues', '/admin/leagues', 'Ligy', 'moderator'),
  ('matches', '/admin/matches', 'Zápasy', 'moderator'),
  ('tables', '/admin/tables', 'Tabulky', 'moderator'),
  ('users', '/admin/users', 'Uživatelé', 'admin'),
  ('permissions', '/admin/permissions', 'Práva', 'admin'),
  ('settings', '/admin/settings', 'Nastavení', 'admin')
on conflict (page_key) do update
set
  page_path = excluded.page_path,
  page_label = excluded.page_label;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.admin_page_permissions to authenticated;
grant all privileges on public.admin_page_permissions to service_role;
