-- Run this once in Supabase Dashboard > SQL Editor to enable the public gallery.

create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists gallery_albums_event_date_active_idx
  on public.gallery_albums (event_date desc nulls last, created_at desc)
  where deleted_at is null;

create index if not exists gallery_albums_created_by_player_active_idx
  on public.gallery_albums (created_by_player_id)
  where deleted_at is null;

create index if not exists gallery_photos_album_active_idx
  on public.gallery_photos (album_id, sort_order)
  where deleted_at is null;

drop trigger if exists gallery_albums_set_updated_at on public.gallery_albums;
create trigger gallery_albums_set_updated_at
  before update on public.gallery_albums
  for each row execute function public.set_updated_at();

drop trigger if exists gallery_photos_set_updated_at on public.gallery_photos;
create trigger gallery_photos_set_updated_at
  before update on public.gallery_photos
  for each row execute function public.set_updated_at();

drop trigger if exists gallery_albums_audit on public.gallery_albums;
create trigger gallery_albums_audit
  after insert or update or delete on public.gallery_albums
  for each row execute function public.audit_row_change();

drop trigger if exists gallery_photos_audit on public.gallery_photos;
create trigger gallery_photos_audit
  after insert or update or delete on public.gallery_photos
  for each row execute function public.audit_row_change();

alter table public.gallery_albums enable row level security;
alter table public.gallery_photos enable row level security;

drop policy if exists "Anyone can view active gallery albums" on public.gallery_albums;
create policy "Anyone can view active gallery albums"
  on public.gallery_albums for select
  using (deleted_at is null);

drop policy if exists "Players can create gallery albums" on public.gallery_albums;
create policy "Players can create gallery albums"
  on public.gallery_albums for insert
  with check (public.has_role(array['player', 'captain', 'moderator', 'admin']::public.app_role[]));

drop policy if exists "Admins can update gallery albums" on public.gallery_albums;
create policy "Admins can update gallery albums"
  on public.gallery_albums for update
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "Admins can delete gallery albums" on public.gallery_albums;
create policy "Admins can delete gallery albums"
  on public.gallery_albums for delete
  using (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "Anyone can view active gallery photos" on public.gallery_photos;
create policy "Anyone can view active gallery photos"
  on public.gallery_photos for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.gallery_albums album
      where album.id = gallery_photos.album_id
        and album.deleted_at is null
    )
  );

drop policy if exists "Players can create gallery photos" on public.gallery_photos;
create policy "Players can create gallery photos"
  on public.gallery_photos for insert
  with check (public.has_role(array['player', 'captain', 'moderator', 'admin']::public.app_role[]));

drop policy if exists "Admins can update gallery photos" on public.gallery_photos;
create policy "Admins can update gallery photos"
  on public.gallery_photos for update
  using (public.has_role(array['admin']::public.app_role[]))
  with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "Admins can delete gallery photos" on public.gallery_photos;
create policy "Admins can delete gallery photos"
  on public.gallery_photos for delete
  using (public.has_role(array['admin']::public.app_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view gallery storage objects" on storage.objects;
create policy "Anyone can view gallery storage objects"
  on storage.objects for select
  using (bucket_id = 'gallery');

grant usage on schema public to anon, authenticated, service_role;
grant select on public.gallery_albums to anon, authenticated;
grant select on public.gallery_photos to anon, authenticated;
grant insert on public.gallery_albums to authenticated;
grant insert on public.gallery_photos to authenticated;
grant update, delete on public.gallery_albums to authenticated;
grant update, delete on public.gallery_photos to authenticated;
grant all privileges on public.gallery_albums to service_role;
grant all privileges on public.gallery_photos to service_role;
