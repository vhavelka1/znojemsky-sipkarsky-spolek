alter table public.players
  add column if not exists date_of_birth date,
  add column if not exists residence text,
  add column if not exists email text;

create index if not exists players_email_active_idx
  on public.players (lower(email))
  where deleted_at is null and email is not null;
