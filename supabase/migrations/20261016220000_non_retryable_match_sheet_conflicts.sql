-- Hotfix for installations that already applied the numeric-cell migration.
-- 40001 is a serialization failure: older PostgREST versions retry it forever.
-- PT409 is an ordinary HTTP conflict and must not trigger transaction retries.
-- This changes only the function definition, never match data or audit history.
do $hotfix$
declare
  definition text;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '15s', true);
  definition := pg_get_functiondef(
    'public.match_sheet_commit_numeric_cell(uuid,jsonb,public.match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid)'::regprocedure
  );
  if position('errcode = ''40001''' in definition) > 0 then
    execute replace(definition, 'errcode = ''40001''', 'errcode = ''PT409''');
  end if;
end;
$hotfix$;

notify pgrst, 'reload schema';
