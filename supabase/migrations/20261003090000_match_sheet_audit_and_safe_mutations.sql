create table if not exists public.match_sheet_audit_logs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  game_id uuid,
  entity_type text not null,
  entity_id uuid,
  field_name text not null,
  operation text not null,
  old_value jsonb,
  new_value jsonb,
  actor_user_id uuid,
  actor_player_id uuid,
  actor_role text,
  actor_team_season_id uuid,
  source text not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint match_sheet_audit_entity_type_valid check (
    entity_type in (
      'match',
      'match_game',
      'match_game_player',
      'match_game_achievement',
      'match_player_slot',
      'match_block_lineup_reveal',
      'match_confirmation'
    )
  ),
  constraint match_sheet_audit_operation_valid check (
    operation in ('insert', 'update', 'soft_delete', 'confirm', 'unlock', 'status_update')
  ),
  constraint match_sheet_audit_source_valid check (
    source in ('captain_sheet', 'admin_sheet', 'system', 'repair', 'migration')
  )
);

create index if not exists match_sheet_audit_match_created_idx
  on public.match_sheet_audit_logs (match_id, created_at desc);

create index if not exists match_sheet_audit_field_idx
  on public.match_sheet_audit_logs (match_id, game_id, field_name, created_at desc);

create index if not exists match_sheet_audit_request_idx
  on public.match_sheet_audit_logs (request_id);

alter table public.match_sheet_audit_logs enable row level security;

drop policy if exists "Captains and staff can view match sheet audit logs" on public.match_sheet_audit_logs;
create policy "Captains and staff can view match sheet audit logs"
  on public.match_sheet_audit_logs for select
  using (
    public.has_role(array['moderator', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.matches matched
      join public.team_memberships membership
        on membership.team_season_id in (matched.home_team_id, matched.away_team_id)
      join public.players player on player.id = membership.player_id
      where matched.id = match_sheet_audit_logs.match_id
        and player.user_id = auth.uid()
        and matched.deleted_at is null
        and membership.deleted_at is null
        and membership.left_on is null
        and membership.member_role in ('captain', 'assistant_captain')
        and player.deleted_at is null
    )
  );

revoke insert, update, delete on public.match_sheet_audit_logs from anon, authenticated;
grant select on public.match_sheet_audit_logs to authenticated;
grant all privileges on public.match_sheet_audit_logs to service_role;

create or replace function public.prevent_match_sheet_audit_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'match_sheet_audit_logs is append-only';
end;
$$;

drop trigger if exists match_sheet_audit_logs_append_only on public.match_sheet_audit_logs;
create trigger match_sheet_audit_logs_append_only
  before update or delete on public.match_sheet_audit_logs
  for each row execute function public.prevent_match_sheet_audit_changes();

create or replace function public.match_sheet_save_player_assignment(
  p_match_id uuid,
  p_order_number integer,
  p_side public.match_side,
  p_position integer,
  p_slot_code text,
  p_player_id uuid,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_role text,
  p_actor_team_season_id uuid,
  p_source text,
  p_request_id uuid,
  p_old_value jsonb,
  p_new_value jsonb
)
returns public.match_game_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.match_games;
  v_existing public.match_game_players;
  v_saved public.match_game_players;
  v_operation text;
begin
  select *
    into v_game
    from public.match_games
    where match_id = p_match_id
      and order_number = p_order_number
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Match game was not found.';
  end if;

  select *
    into v_existing
    from public.match_game_players
    where match_game_id = v_game.id
      and side = p_side
      and position = p_position
      and deleted_at is null
    for update;

  if p_player_id is null then
    if found then
      update public.match_game_players
         set deleted_at = now()
       where id = v_existing.id
       returning * into v_saved;

      insert into public.match_sheet_audit_logs (
        match_id, game_id, entity_type, entity_id, field_name, operation,
        old_value, new_value, actor_user_id, actor_player_id, actor_role,
        actor_team_season_id, source, request_id
      )
      values (
        p_match_id, v_game.id, 'match_game_player', v_existing.id,
        concat('player:', p_side::text, ':', p_position::text),
        'soft_delete', p_old_value, p_new_value, p_actor_user_id,
        p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source,
        p_request_id
      );

      update public.match_game_achievements
         set deleted_at = now()
       where match_id = p_match_id
         and match_game_id = v_game.id
         and player_id = v_existing.player_id
         and deleted_at is null;
    end if;

    return v_saved;
  end if;

  if found then
    update public.match_game_players
       set player_id = p_player_id,
           slot_code = p_slot_code
     where id = v_existing.id
     returning * into v_saved;
    v_operation = 'update';
  else
    insert into public.match_game_players (
      match_game_id, side, player_id, position, slot_code
    )
    values (v_game.id, p_side, p_player_id, p_position, p_slot_code)
    returning * into v_saved;
    v_operation = 'insert';
  end if;

  insert into public.match_sheet_audit_logs (
    match_id, game_id, entity_type, entity_id, field_name, operation,
    old_value, new_value, actor_user_id, actor_player_id, actor_role,
    actor_team_season_id, source, request_id
  )
  values (
    p_match_id, v_game.id, 'match_game_player', v_saved.id,
    concat('player:', p_side::text, ':', p_position::text),
    v_operation, p_old_value, p_new_value, p_actor_user_id,
    p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source,
    p_request_id
  );

  if found and v_existing.player_id <> p_player_id then
    update public.match_game_achievements
       set deleted_at = now()
     where match_id = p_match_id
       and match_game_id = v_game.id
       and player_id = v_existing.player_id
       and deleted_at is null;
  end if;

  return v_saved;
end;
$$;

grant execute on function public.match_sheet_save_player_assignment(
  uuid, integer, public.match_side, integer, text, uuid, uuid, uuid, text, uuid, text, uuid, jsonb, jsonb
) to service_role;

create or replace function public.match_sheet_save_achievement(
  p_match_id uuid,
  p_game_id uuid,
  p_player_id uuid,
  p_achievement_type text,
  p_achievement_count integer,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_role text,
  p_actor_team_season_id uuid,
  p_source text,
  p_request_id uuid,
  p_old_value jsonb,
  p_new_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.match_games;
  v_existing_ids uuid[];
  v_old_total integer;
  v_checkout_total integer;
  v_saved_id uuid;
  v_operation text;
begin
  if p_achievement_count < 0 then
    raise exception 'Achievement count must not be negative.';
  end if;

  select *
    into v_game
    from public.match_games
    where id = p_game_id
      and match_id = p_match_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Match game was not found.';
  end if;

  perform 1
    from public.match_game_players
    where match_game_id = p_game_id
      and player_id = p_player_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Player is not assigned to this game.';
  end if;

  select array_agg(id), coalesce(sum(achievement_count), 0)
    into v_existing_ids, v_old_total
    from public.match_game_achievements
    where match_id = p_match_id
      and match_game_id = p_game_id
      and player_id = p_player_id
      and achievement_type = p_achievement_type
      and deleted_at is null;

  update public.match_game_achievements
     set deleted_at = now()
   where id = any(coalesce(v_existing_ids, array[]::uuid[]));

  if p_achievement_count > 0 then
    if p_achievement_type = 'checkout_100_plus' then
      select coalesce(sum(achievement_count), 0)
        into v_checkout_total
        from public.match_game_achievements
        where match_id = p_match_id
          and player_id = p_player_id
          and achievement_type = p_achievement_type
          and deleted_at is null;

      if v_checkout_total + p_achievement_count > 3 then
        raise exception 'Checkout 100+ can be recorded at most 3 times per player and match.';
      end if;
    end if;

    insert into public.match_game_achievements (
      match_id, match_game_id, player_id, achievement_type, achievement_count
    )
    values (
      p_match_id, p_game_id, p_player_id, p_achievement_type, p_achievement_count
    )
    returning id into v_saved_id;
  else
    v_saved_id = coalesce(v_existing_ids[1], null);
  end if;

  if v_old_total <> p_achievement_count then
    v_operation = case
      when p_achievement_count > 0 and v_old_total = 0 then 'insert'
      when p_achievement_count = 0 then 'soft_delete'
      else 'update'
    end;

    insert into public.match_sheet_audit_logs (
      match_id, game_id, entity_type, entity_id, field_name, operation,
      old_value, new_value, actor_user_id, actor_player_id, actor_role,
      actor_team_season_id, source, request_id
    )
    values (
      p_match_id, p_game_id, 'match_game_achievement', v_saved_id,
      concat('achievement:', p_achievement_type),
      v_operation, p_old_value, p_new_value, p_actor_user_id,
      p_actor_player_id, p_actor_role, p_actor_team_season_id, p_source,
      p_request_id
    );
  end if;

  return v_saved_id;
end;
$$;

grant execute on function public.match_sheet_save_achievement(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, uuid, text, uuid, jsonb, jsonb
) to service_role;
