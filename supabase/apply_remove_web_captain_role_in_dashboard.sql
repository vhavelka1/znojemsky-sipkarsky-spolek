update public.user_profiles
set app_role = 'player',
    updated_at = now()
where app_role = 'captain'
  and deleted_at is null;

update public.admin_page_permissions
set minimum_role = 'moderator',
    updated_at = now()
where minimum_role = 'captain'
  and deleted_at is null;

alter table public.user_profiles
  drop constraint if exists user_profiles_app_role_valid;

alter table public.user_profiles
  add constraint user_profiles_app_role_valid
  check (app_role in ('player', 'moderator', 'admin'));

alter table public.admin_page_permissions
  drop constraint if exists admin_page_permissions_minimum_role_valid;

alter table public.admin_page_permissions
  add constraint admin_page_permissions_minimum_role_valid
  check (minimum_role in ('player', 'moderator', 'admin'));

notify pgrst, 'reload schema';
