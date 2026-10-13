drop function if exists public.match_sheet_update_summary(
  uuid, public.match_side, uuid, uuid, text, uuid, text, uuid
);

create or replace function public.match_sheet_update_summary(
  p_match_id uuid,
  p_confirmation_side_to_delete public.match_side,
  p_preserve_confirmation_state boolean,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_role text,
  p_actor_team_season_id uuid,
  p_source text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_result public.match_results%rowtype;
  v_confirmation public.match_confirmations%rowtype;
  v_home_points integer;
  v_away_points integer;
  v_completed_core_games integer;
  v_next_status public.match_status;
  v_next_played_at timestamptz;
  v_deleted_at timestamptz;
  v_should_audit boolean := p_request_id is not null and p_source is not null;
begin
  select *
    into v_match
    from public.matches
    where id = p_match_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Zapas nebyl nalezen.';
  end if;

  select
    coalesce(sum(
      case
        when game_type = 'tiebreak_701' and home_legs = 1 and away_legs < 1 then 1
        when game_type <> 'tiebreak_701' and home_legs = 3 and away_legs < 3 then 1
        else 0
      end
    ), 0)::integer,
    coalesce(sum(
      case
        when game_type = 'tiebreak_701' and away_legs = 1 and home_legs < 1 then 1
        when game_type <> 'tiebreak_701' and away_legs = 3 and home_legs < 3 then 1
        else 0
      end
    ), 0)::integer,
    count(*) filter (where order_number <= 18 and winner_side is not null)::integer
    into v_home_points, v_away_points, v_completed_core_games
    from public.match_games
    where match_id = p_match_id
      and order_number <= 18
      and deleted_at is null;

  select *
    into v_result
    from public.match_results
    where match_id = p_match_id
      and deleted_at is null
    for update;

  if found then
    update public.match_results
       set home_points = v_home_points,
           away_points = v_away_points
     where id = v_result.id;
  else
    begin
      insert into public.match_results (match_id, home_points, away_points)
      values (p_match_id, v_home_points, v_away_points);
    exception
      when unique_violation then
        select *
          into v_result
          from public.match_results
          where match_id = p_match_id
            and deleted_at is null
          for update;

        if not found then
          raise;
        end if;

        update public.match_results
           set home_points = v_home_points,
               away_points = v_away_points
         where id = v_result.id;
    end;
  end if;

  if p_preserve_confirmation_state and v_match.status = 'confirmed'::public.match_status then
    v_next_status = v_match.status;
    v_next_played_at = coalesce(v_match.played_at, clock_timestamp());
  else
    v_next_status = case
      when v_completed_core_games = 18 then 'awaiting_confirmation'::public.match_status
      else 'scheduled'::public.match_status
    end;
    v_next_played_at = case
      when v_completed_core_games = 18 then clock_timestamp()
      else null
    end;
  end if;

  update public.matches
     set status = v_next_status,
         played_at = v_next_played_at
   where id = p_match_id;

  if v_should_audit
    and (
      v_match.status is distinct from v_next_status
      or v_match.played_at is distinct from v_next_played_at
    )
  then
    insert into public.match_sheet_audit_logs (
      match_id, entity_type, entity_id, field_name, operation,
      old_value, new_value, actor_user_id, actor_player_id, actor_role,
      actor_team_season_id, source, request_id
    )
    values (
      p_match_id, 'match', p_match_id, 'status', 'status_update',
      jsonb_build_object('status', v_match.status, 'played_at', v_match.played_at),
      jsonb_build_object('status', v_next_status, 'played_at', v_next_played_at),
      p_actor_user_id, p_actor_player_id, p_actor_role, p_actor_team_season_id,
      p_source, p_request_id
    );
  end if;

  v_deleted_at = clock_timestamp();

  if not p_preserve_confirmation_state then
    for v_confirmation in
      select *
        from public.match_confirmations
        where match_id = p_match_id
          and deleted_at is null
          and (
            p_confirmation_side_to_delete is null
            or side = p_confirmation_side_to_delete
          )
        for update
    loop
      update public.match_confirmations
         set deleted_at = v_deleted_at
       where id = v_confirmation.id;

      if v_should_audit then
        insert into public.match_sheet_audit_logs (
          match_id, entity_type, entity_id, field_name, operation,
          old_value, new_value, actor_user_id, actor_player_id, actor_role,
          actor_team_season_id, source, request_id
        )
        values (
          p_match_id, 'match_confirmation', v_confirmation.id,
          concat('confirmation:', v_confirmation.side::text), 'soft_delete',
          jsonb_build_object(
            'id', v_confirmation.id,
            'match_id', v_confirmation.match_id,
            'side', v_confirmation.side,
            'captain_player_id', v_confirmation.captain_player_id,
            'confirmed_at', v_confirmation.confirmed_at
          ),
          null,
          p_actor_user_id, p_actor_player_id, p_actor_role, p_actor_team_season_id,
          p_source, p_request_id
        );
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.match_sheet_update_summary(
  uuid, public.match_side, boolean, uuid, uuid, text, uuid, text, uuid
) from public;

grant execute on function public.match_sheet_update_summary(
  uuid, public.match_side, boolean, uuid, uuid, text, uuid, text, uuid
) to service_role;

notify pgrst, 'reload schema';
