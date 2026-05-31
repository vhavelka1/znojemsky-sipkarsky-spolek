-- Remove constraints left behind by early match-sheet drafts and enforce the
-- official ZSS order: singles 1-8 and 11-18, doubles 9, cricket 10, tiebreak 19.
alter table public.match_games
  drop constraint if exists match_games_single_order_valid,
  drop constraint if exists match_games_singles_order_valid,
  drop constraint if exists match_games_doubles_order_valid,
  drop constraint if exists match_games_cricket_order_valid,
  drop constraint if exists match_games_tiebreak_order_valid,
  drop constraint if exists match_games_order_valid,
  drop constraint if exists match_games_type_order_valid;

alter table public.match_games
  add constraint match_games_order_valid check (order_number between 1 and 19),
  add constraint match_games_type_order_valid check (
    (game_type = 'singles' and (order_number between 1 and 8 or order_number between 11 and 18))
    or (game_type = 'doubles' and order_number = 9)
    or (game_type = 'cricket' and order_number = 10)
    or (game_type = 'tiebreak_701' and order_number = 19)
  );

notify pgrst, 'reload schema';

