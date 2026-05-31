create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists app_settings_key_idx on public.app_settings (key);
create index if not exists app_settings_deleted_at_idx on public.app_settings (deleted_at);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

drop trigger if exists app_settings_audit on public.app_settings;
create trigger app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();

alter table public.app_settings enable row level security;

grant select on public.app_settings to anon, authenticated, service_role;
grant insert, update, delete on public.app_settings to authenticated, service_role;
grant all on public.app_settings to service_role;

drop policy if exists "Anyone can view active app settings" on public.app_settings;
create policy "Anyone can view active app settings"
  on public.app_settings for select
  using (deleted_at is null);

drop policy if exists "Moderators can manage app settings" on public.app_settings;
create policy "Moderators can manage app settings"
  on public.app_settings for all
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

insert into public.app_settings (key, value)
values
  ('homepage_kicker', 'Regionální šipková liga'),
  ('homepage_title', 'Znojemský šipkařský spolek'),
  ('homepage_subtitle', 'Oficiální systém lig, turnajů a statistik.')
on conflict (key) do nothing;
