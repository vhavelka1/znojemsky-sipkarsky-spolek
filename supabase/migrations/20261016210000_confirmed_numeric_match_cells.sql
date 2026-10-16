-- Numeric edits, conflict checks, audit and summary must succeed or roll back together.
-- Lock the match before the game, as match_sheet_update_summary does.
create or replace function public.match_sheet_commit_numeric_cell(
  p_match_id uuid,
  p_cell jsonb,
  p_viewer_side public.match_side,
  p_can_manage_both_sides boolean,
  p_can_manage_confirmed_match boolean,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_role text,
  p_actor_team_season_id uuid,
  p_source text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_game public.match_games%rowtype;
  v_side public.match_side;
  v_home integer;
  v_away integer;
  v_max integer;
  v_field text;
  v_old integer;
  v_new integer;
  v_player_id uuid;
  v_type public.match_game_achievements.achievement_type%type;
  v_saved_id uuid;
  v_existing_ids uuid[];
  v_checkout_total integer;
  v_changed boolean := false;
begin
  if p_request_id is null or p_cell->>'type' not in ('legs', 'achievement') then
    raise exception using errcode = '22023', message = 'Změna pole není platná.';
  end if;

  select * into v_match from public.matches
    where id = p_match_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = '22023', message = 'Zápas nebyl nalezen.';
  end if;
  if v_match.status = 'confirmed' and not p_can_manage_confirmed_match then
    raise exception using errcode = '42501', message = 'Potvrzený zápas je uzamčený.';
  end if;
  if not p_can_manage_both_sides and p_viewer_side is null then
    raise exception using errcode = '42501', message = 'Nemáte oprávnění upravit tento zápis.';
  end if;

  select * into v_game from public.match_games
    where match_id = p_match_id and order_number = (p_cell->>'order_number')::integer
      and deleted_at is null for update;
  if not found then
    raise exception using errcode = '22023', message = 'Nejprve uložte nasazení hry.';
  end if;

  if p_cell->>'type' = 'legs' then
    v_side := p_viewer_side;
  else
    v_player_id := (p_cell->>'player_id')::uuid;
    v_type := p_cell->>'achievement_type';
    if v_game.game_type <> 'singles' or v_type not in ('score_95_plus', 'score_133_plus', 'score_171_plus', 'checkout_100_plus') then
      raise exception using errcode = '22023', message = 'Statistika není platná pro tuto hru.';
    end if;
    select side into v_side from public.match_game_players
      where match_game_id = v_game.id and player_id = v_player_id and deleted_at is null;
    if not found then
      raise exception using errcode = 'PT409', message = 'Nasazení hráče se změnilo. Obnovte zápis.';
    end if;
    if not p_can_manage_both_sides and v_side is distinct from p_viewer_side then
      raise exception using errcode = '42501', message = 'Můžete upravit jen statistiky vlastní strany.';
    end if;
  end if;

  if not p_can_manage_both_sides and exists (
    select 1 from public.match_confirmations where match_id = p_match_id and side = v_side and deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'Vaše strana zápisu je již potvrzená.';
  end if;

  -- A retry after a lost response must never replay an already applied edit.
  if exists (select 1 from public.match_sheet_audit_logs where match_id = p_match_id and request_id = p_request_id) then
    return to_jsonb(v_game);
  end if;

  if p_cell->>'type' = 'legs' then
    if not (p_cell ? 'home_legs' or p_cell ? 'away_legs')
      or p_cell->>'expected_updated_at' is null then
      raise exception using errcode = '22023', message = 'Chybí původní verze nebo hodnota legů.';
    end if;
    if v_game.updated_at is distinct from (p_cell->>'expected_updated_at')::timestamptz then
      raise exception using errcode = 'PT409', message = 'Legy mezitím upravil někdo jiný. Zkontrolujte aktuální zápis.';
    end if;
    v_home := case when p_cell ? 'home_legs' then (p_cell->>'home_legs')::integer else v_game.home_legs end;
    v_away := case when p_cell ? 'away_legs' then (p_cell->>'away_legs')::integer else v_game.away_legs end;
    v_max := case when v_game.game_type = 'tiebreak_701' then 1 else 3 end;
    if v_home is null or v_away is null or v_home < 0 or v_away < 0 or v_home > v_max or v_away > v_max or (v_home = v_max and v_away = v_max) then
      raise exception using errcode = '22023', message = 'Neplatný výsledek. Opravte příslušné pole; druhá strana se automaticky nemění.';
    end if;
    foreach v_field in array array['home_legs', 'away_legs'] loop
      v_old := case when v_field = 'home_legs' then v_game.home_legs else v_game.away_legs end;
      v_new := case when v_field = 'home_legs' then v_home else v_away end;
      if v_old <> v_new then
        v_changed := true;
        insert into public.match_sheet_audit_logs (
          match_id, game_id, entity_type, entity_id, field_name, operation, old_value, new_value,
          actor_user_id, actor_player_id, actor_role, actor_team_season_id, source, request_id
        ) values (
          p_match_id, v_game.id, 'match_game', v_game.id, v_field, 'update', to_jsonb(v_old), to_jsonb(v_new),
          p_actor_user_id, p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source, p_request_id
        );
      end if;
    end loop;
    if v_changed then
      update public.match_games set
        home_legs = v_home, away_legs = v_away,
        winner_side = case when v_home = v_max then 'home'::public.match_side when v_away = v_max then 'away'::public.match_side else null end
      where id = v_game.id returning * into v_game;
    end if;
  else
    v_new := (p_cell->>'achievement_count')::integer;
    if v_new is null or v_new < 0 or p_cell->>'expected_count' is null then
      raise exception using errcode = '22023', message = 'Zadejte platný počet statistik a původní hodnotu.';
    end if;
    select array_agg(id), coalesce(sum(achievement_count), 0)::integer into v_existing_ids, v_old
      from public.match_game_achievements where match_game_id = v_game.id
        and player_id = v_player_id and achievement_type = v_type and deleted_at is null;
    if v_old is distinct from (p_cell->>'expected_count')::integer then
      raise exception using errcode = 'PT409', message = 'Statistiku mezitím upravil někdo jiný. Zkontrolujte aktuální hodnotu.';
    end if;
    if v_new <> v_old then
      if v_type = 'checkout_100_plus' then
        select coalesce(sum(achievement_count), 0)::integer into v_checkout_total from public.match_game_achievements
          where match_id = p_match_id and player_id = v_player_id and achievement_type = v_type and deleted_at is null;
        if v_checkout_total - v_old + v_new > 3 then
          raise exception using errcode = '22023', message = 'Zavření 100+ může mít hráč v zápasu nejvýše 3×.';
        end if;
      end if;
      update public.match_game_achievements set deleted_at = now() where id = any(coalesce(v_existing_ids, array[]::uuid[]));
      if v_new > 0 then
        insert into public.match_game_achievements (match_id, match_game_id, player_id, achievement_type, achievement_count)
          values (p_match_id, v_game.id, v_player_id, v_type, v_new) returning id into v_saved_id;
      else
        v_saved_id := v_existing_ids[1];
      end if;
      insert into public.match_sheet_audit_logs (
        match_id, game_id, entity_type, entity_id, field_name, operation, old_value, new_value,
        actor_user_id, actor_player_id, actor_role, actor_team_season_id, source, request_id
      ) values (
        p_match_id, v_game.id, 'match_game_achievement', v_saved_id, concat('achievement:', v_type),
        case when v_new = 0 then 'soft_delete' when v_old = 0 then 'insert' else 'update' end,
        jsonb_build_object('player_id', v_player_id, 'achievement_type', v_type, 'achievement_count', v_old),
        jsonb_build_object('player_id', v_player_id, 'achievement_type', v_type, 'achievement_count', v_new),
        p_actor_user_id, p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source, p_request_id
      );
      v_changed := true;
    end if;
  end if;

  if v_changed then
    perform public.match_sheet_update_summary(
      p_match_id,
      case when p_cell->>'type' = 'legs' and not p_can_manage_both_sides then p_viewer_side else null end,
      v_match.status = 'confirmed' and p_can_manage_confirmed_match,
      p_actor_user_id, p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source, p_request_id
    );
  end if;
  return to_jsonb(v_game);
end;
$$;

revoke all on function public.match_sheet_commit_numeric_cell(uuid, jsonb, public.match_side, boolean, boolean, uuid, uuid, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.match_sheet_commit_numeric_cell(uuid, jsonb, public.match_side, boolean, boolean, uuid, uuid, text, uuid, text, uuid) to service_role;

-- Previous security-definer helpers must not offer a browser-side bypass of the API.
do $$
begin
  if to_regprocedure('public.match_sheet_save_achievement(uuid,uuid,uuid,text,integer,uuid,uuid,text,uuid,text,uuid,jsonb,jsonb)') is not null then
    revoke all on function public.match_sheet_save_achievement(uuid,uuid,uuid,text,integer,uuid,uuid,text,uuid,text,uuid,jsonb,jsonb) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.match_sheet_save_player_assignment(uuid,integer,public.match_side,integer,text,uuid,uuid,uuid,text,uuid,text,uuid,jsonb,jsonb)') is not null then
    revoke all on function public.match_sheet_save_player_assignment(uuid,integer,public.match_side,integer,text,uuid,uuid,uuid,text,uuid,text,uuid,jsonb,jsonb) from public, anon, authenticated;
  end if;
end;
$$;

notify pgrst, 'reload schema';
