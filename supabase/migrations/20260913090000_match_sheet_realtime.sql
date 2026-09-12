do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'matches',
    'match_games',
    'match_game_achievements',
    'match_player_slots',
    'match_block_lineup_reveals',
    'match_confirmations'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach realtime_table in array realtime_tables loop
    if
      to_regclass(format('public.%I', realtime_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
