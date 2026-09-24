alter table public.match_block_lineup_reveals
  drop constraint if exists match_block_lineup_reveals_block_valid;

alter table public.match_block_lineup_reveals
  add constraint match_block_lineup_reveals_block_valid check (block_number between 1 and 8);

notify pgrst, 'reload schema';
