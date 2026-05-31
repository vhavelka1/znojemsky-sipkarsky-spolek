-- Convert the early generic match-sheet order to the official ZSS paper form.
-- Existing rows are moved through a temporary range to avoid active-order collisions.
alter table public.match_games
  drop constraint if exists match_games_order_valid,
  drop constraint if exists match_games_type_order_valid;

update public.match_games
set order_number = order_number + 100
where deleted_at is null;

update public.match_games
set order_number = case
  when game_type = 'singles' and order_number between 101 and 108 then order_number - 100
  when game_type = 'singles' and order_number between 109 and 118 then order_number - 98
  when game_type = 'doubles' then 9
  when game_type = 'cricket' then 10
  when game_type = 'tiebreak_701' then 19
  else order_number - 100
end
where deleted_at is null;

alter table public.match_games
  add constraint match_games_order_valid check (order_number between 1 and 19),
  add constraint match_games_type_order_valid check (
    (game_type = 'singles' and (order_number between 1 and 8 or order_number between 11 and 18))
    or (game_type = 'doubles' and order_number = 9)
    or (game_type = 'cricket' and order_number = 10)
    or (game_type = 'tiebreak_701' and order_number = 19)
  );
