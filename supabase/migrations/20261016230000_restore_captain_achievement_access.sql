-- Restore the pre-existing workflow: either match captain can record statistics
-- for an assigned player on either team until that target side is confirmed.
-- Match access, assigned-player checks, conflicts and confirmation locks remain.
-- Changes only the function definition; does not change any match data.
do $hotfix$
declare
  definition text;
  original text;
  restriction text := $restriction$    if not p_can_manage_both_sides and v_side is distinct from p_viewer_side then
      raise exception using errcode = '42501', message = 'Můžete upravit jen statistiky vlastní strany.';
    end if;
$restriction$;
begin
  perform set_config('lock_timeout', '3s', true);
  original := pg_get_functiondef(
    'public.match_sheet_commit_numeric_cell(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid)'::regprocedure
  );
  definition := replace(original, chr(13), '');
  if position('errcode = ''40001''' in definition) > 0 then
    raise exception 'Nejprve spusťte migraci 20261016220000_non_retryable_match_sheet_conflicts.sql.';
  end if;
  if position('Můžete upravit jen statistiky vlastní strany.' in definition) > 0 then
    if position(restriction in definition) = 0 then
      raise exception 'Definice funkce neodpovídá očekávané verzi. Nebyla provedena žádná změna.';
    end if;
    definition := replace(definition, restriction, '');
  end if;
  definition := replace(definition, 'Vaše strana zápisu je již potvrzená.', 'Tato strana zápisu je již potvrzená.');
  if definition is distinct from original then
    execute definition;
  end if;
end;
$hotfix$;

notify pgrst, 'reload schema';
