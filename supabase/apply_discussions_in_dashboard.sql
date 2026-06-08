-- Run this once in Supabase Dashboard > SQL Editor to enable public discussions.

create table if not exists public.discussion_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_player_id uuid references public.players(id) on delete set null,
  last_commented_at timestamptz not null default now(),
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.discussion_comments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.discussion_topics(id) on delete cascade,
  body text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists discussion_topics_last_commented_active_idx
  on public.discussion_topics (last_commented_at desc, created_at desc)
  where deleted_at is null;

create index if not exists discussion_topics_created_by_player_active_idx
  on public.discussion_topics (created_by_player_id)
  where deleted_at is null;

create index if not exists discussion_comments_topic_active_idx
  on public.discussion_comments (topic_id, created_at asc)
  where deleted_at is null;

create index if not exists discussion_comments_created_by_player_active_idx
  on public.discussion_comments (created_by_player_id)
  where deleted_at is null;

drop trigger if exists discussion_topics_set_updated_at on public.discussion_topics;
create trigger discussion_topics_set_updated_at
  before update on public.discussion_topics
  for each row execute function public.set_updated_at();

drop trigger if exists discussion_comments_set_updated_at on public.discussion_comments;
create trigger discussion_comments_set_updated_at
  before update on public.discussion_comments
  for each row execute function public.set_updated_at();

drop trigger if exists discussion_topics_audit on public.discussion_topics;
create trigger discussion_topics_audit
  after insert or update or delete on public.discussion_topics
  for each row execute function public.audit_row_change();

drop trigger if exists discussion_comments_audit on public.discussion_comments;
create trigger discussion_comments_audit
  after insert or update or delete on public.discussion_comments
  for each row execute function public.audit_row_change();

alter table public.discussion_topics enable row level security;
alter table public.discussion_comments enable row level security;

drop policy if exists "Anyone can view active discussion topics" on public.discussion_topics;
create policy "Anyone can view active discussion topics"
  on public.discussion_topics for select
  using (deleted_at is null);

drop policy if exists "Captains can create discussion topics" on public.discussion_topics;
create policy "Captains can create discussion topics"
  on public.discussion_topics for insert
  with check (public.has_role(array['captain', 'moderator', 'admin']::public.app_role[]));

drop policy if exists "Moderators can update discussion topics" on public.discussion_topics;
create policy "Moderators can update discussion topics"
  on public.discussion_topics for update
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Admins can delete discussion topics" on public.discussion_topics;
create policy "Admins can delete discussion topics"
  on public.discussion_topics for delete
  using (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "Anyone can view active discussion comments" on public.discussion_comments;
create policy "Anyone can view active discussion comments"
  on public.discussion_comments for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.discussion_topics topic
      where topic.id = discussion_comments.topic_id
        and topic.deleted_at is null
    )
  );

drop policy if exists "Players can create discussion comments" on public.discussion_comments;
create policy "Players can create discussion comments"
  on public.discussion_comments for insert
  with check (public.has_role(array['player', 'captain', 'moderator', 'admin']::public.app_role[]));

drop policy if exists "Moderators can update discussion comments" on public.discussion_comments;
create policy "Moderators can update discussion comments"
  on public.discussion_comments for update
  using (public.has_role(array['moderator', 'admin']::public.app_role[]))
  with check (public.has_role(array['moderator', 'admin']::public.app_role[]));

drop policy if exists "Admins can delete discussion comments" on public.discussion_comments;
create policy "Admins can delete discussion comments"
  on public.discussion_comments for delete
  using (public.has_role(array['admin']::public.app_role[]));

grant usage on schema public to anon, authenticated, service_role;
grant select on public.discussion_topics to anon, authenticated;
grant select on public.discussion_comments to anon, authenticated;
grant insert on public.discussion_topics to authenticated;
grant insert on public.discussion_comments to authenticated;
grant update, delete on public.discussion_topics to authenticated;
grant update, delete on public.discussion_comments to authenticated;
grant all privileges on public.discussion_topics to service_role;
grant all privileges on public.discussion_comments to service_role;
