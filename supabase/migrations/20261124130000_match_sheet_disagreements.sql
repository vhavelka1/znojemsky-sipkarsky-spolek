begin;

-- Persistent field disagreements and independent confirmation by both sides.
create table if not exists public.match_sheet_disagreements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  field_key text not null,
  value integer not null,
  revision uuid not null default gen_random_uuid(),
  home_confirmed_by uuid,
  away_confirmed_by uuid,
  resolved_at timestamptz,
  unique (match_id, field_key)
);
alter table public.match_sheet_disagreements enable row level security;
revoke all on public.match_sheet_disagreements from public, anon, authenticated;
grant select, insert, update on public.match_sheet_disagreements to service_role;

-- Keep the audited last-write-wins operation as the inner transaction.
do $$ begin
  if to_regprocedure('public.match_sheet_commit_numeric_cell_base(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid)') is null then
    alter function public.match_sheet_commit_numeric_cell(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid) rename to match_sheet_commit_numeric_cell_base;
  end if;
end $$;

create or replace function public.match_sheet_commit_numeric_cell(
  p_match_id uuid, p_cell jsonb, p_viewer_side public.match_side, p_can_manage_both_sides boolean,
  p_can_manage_confirmed_match boolean, p_actor_user_id uuid, p_actor_player_id uuid,
  p_actor_role text, p_actor_team_season_id uuid, p_source text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  g public.match_games%rowtype;
  v_key text; v_audit_field text; v_old integer; v_new integer; v_base integer;
  v_previous_actor uuid; v_player uuid; v_result jsonb; v_duplicate boolean;
begin
  perform 1 from public.matches where id=p_match_id and deleted_at is null for update;
  select exists(select 1 from public.match_sheet_numeric_requests where match_id=p_match_id and request_id=p_request_id)
    or exists(select 1 from public.match_sheet_audit_logs where match_id=p_match_id and request_id=p_request_id) into v_duplicate;
  select * into g from public.match_games where match_id=p_match_id and order_number=(p_cell->>'order_number')::integer and deleted_at is null for update;
  if p_cell->>'type'='legs' then
    v_audit_field := case when p_cell ? 'home_legs' then 'home_legs' else 'away_legs' end;
    v_key := concat('game:',g.order_number,':',v_audit_field);
    v_old := case when v_audit_field='home_legs' then g.home_legs else g.away_legs end;
    v_new := (p_cell->>v_audit_field)::integer;
  else
    v_player := (p_cell->>'player_id')::uuid;
    v_audit_field := concat('achievement:',p_cell->>'achievement_type');
    v_key := concat('achievement:',g.order_number,':',v_player::text,':',p_cell->>'achievement_type');
    select coalesce(sum(achievement_count),0)::integer into v_old from public.match_game_achievements
      where match_game_id=g.id and player_id=v_player and achievement_type::text=p_cell->>'achievement_type' and deleted_at is null;
    v_new := (p_cell->>'achievement_count')::integer;
  end if;
  v_base := (p_cell->>'expected_count')::integer;
  select actor_user_id into v_previous_actor from public.match_sheet_audit_logs
    where match_id=p_match_id and game_id=g.id and field_name=v_audit_field
      and (v_player is null or new_value->>'player_id'=v_player::text)
    order by created_at desc, id desc limit 1;
  v_result := public.match_sheet_commit_numeric_cell_base(p_match_id,p_cell,p_viewer_side,p_can_manage_both_sides,p_can_manage_confirmed_match,p_actor_user_id,p_actor_player_id,p_actor_role,p_actor_team_season_id,p_source,p_request_id);
  if not v_duplicate and v_old is distinct from v_new then
    if exists(select 1 from public.match_sheet_disagreements where match_id=p_match_id and field_key=v_key and resolved_at is null)
       or (v_base is not null and v_old is distinct from v_base and v_previous_actor is not null and p_actor_user_id is not null and v_previous_actor <> p_actor_user_id) then
      insert into public.match_sheet_disagreements(match_id,field_key,value,revision,home_confirmed_by,away_confirmed_by,resolved_at)
      values(p_match_id,v_key,v_new,gen_random_uuid(),null,null,null)
      on conflict(match_id,field_key) do update set value=excluded.value, revision=excluded.revision,
        home_confirmed_by=null,away_confirmed_by=null,resolved_at=null;
    end if;
  end if;
  return v_result;
end $$;
revoke all on function public.match_sheet_commit_numeric_cell(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.match_sheet_commit_numeric_cell(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid) to service_role;
revoke all on function public.match_sheet_commit_numeric_cell_base(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid) from public, anon, authenticated, service_role;

create or replace function public.match_sheet_confirm_disagreement(p_match_id uuid,p_id uuid,p_revision uuid,p_side public.match_side,p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.match_sheet_disagreements%rowtype;
begin
  perform 1 from public.matches where id=p_match_id and deleted_at is null for update;
  select * into d from public.match_sheet_disagreements where id=p_id and match_id=p_match_id for update;
  if not found or d.resolved_at is not null or d.revision<>p_revision then raise exception using errcode='PT409',message='Hodnota se změnila. Zkontrolujte ji znovu.'; end if;
  if p_side is null or p_user is null then raise exception using errcode='42501',message='Potvrzení vyžaduje přihlášeného zástupce týmu.'; end if;
  if p_side='home' then d.home_confirmed_by:=p_user; else d.away_confirmed_by:=p_user; end if;
  update public.match_sheet_disagreements set home_confirmed_by=d.home_confirmed_by, away_confirmed_by=d.away_confirmed_by,
    resolved_at=case when d.home_confirmed_by is not null and d.away_confirmed_by is not null then now() else null end where id=d.id;
end $$;
revoke all on function public.match_sheet_confirm_disagreement(uuid,uuid,uuid,public.match_side,uuid) from public, anon, authenticated;
grant execute on function public.match_sheet_confirm_disagreement(uuid,uuid,uuid,public.match_side,uuid) to service_role;
-- Serialize final confirmation with numeric edits and refuse unresolved fields.
create or replace function public.match_sheet_require_resolved_disagreements() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.matches where id=new.match_id and deleted_at is null for update;
  if new.deleted_at is null and exists(select 1 from public.match_sheet_disagreements where match_id=new.match_id and resolved_at is null) then
    raise exception using errcode='PT409', message='Nejprve potvrďte všechny označené neshody v zápisu.';
  end if;
  return new;
end $$;
drop trigger if exists match_sheet_require_resolved_disagreements on public.match_confirmations;
create trigger match_sheet_require_resolved_disagreements before insert or update on public.match_confirmations
for each row execute function public.match_sheet_require_resolved_disagreements();

notify pgrst, 'reload schema';

commit;
