alter table public.matches
  add column if not exists round_number integer;

alter table public.matches
  drop constraint if exists matches_round_number_positive;

alter table public.matches
  add constraint matches_round_number_positive
  check (
    round_number is null
    or round_number > 0
  );

create index if not exists matches_round_number_idx
  on public.matches (season_id, league_id, group_id, round_number)
  where deleted_at is null;

notify pgrst, 'reload schema';
