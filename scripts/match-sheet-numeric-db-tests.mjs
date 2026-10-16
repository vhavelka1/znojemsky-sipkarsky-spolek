import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL executes the shipping RPC and summary migration, entirely in memory.
// PGlite serializes its connections: these tests cover stale requests, not lock contention.
const db = new PGlite();
const match = randomUUID(), game = randomUUID(), player = randomUUID();
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type public.match_status as enum ('scheduled','played','awaiting_confirmation','confirmed','cancelled');
    create type public.match_side as enum ('home','away');
    create type public.match_achievement_type as enum ('score_95_plus','score_133_plus','score_171_plus','checkout_100_plus');
    create table matches (id uuid primary key, status match_status default 'scheduled', played_at timestamptz, deleted_at timestamptz);
    create table match_games (id uuid primary key, match_id uuid, order_number int, game_type text, home_legs int, away_legs int, winner_side match_side, updated_at timestamptz default clock_timestamp(), deleted_at timestamptz);
    create function touch_game() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
    create trigger touch before update on match_games for each row execute function touch_game();
    create table match_game_players (id uuid default gen_random_uuid(), match_game_id uuid, player_id uuid, side match_side, deleted_at timestamptz);
    create table match_game_achievements (id uuid default gen_random_uuid(), match_id uuid, match_game_id uuid, player_id uuid, achievement_type match_achievement_type, achievement_count int check (achievement_count > 0), deleted_at timestamptz);
    create table match_results (id uuid default gen_random_uuid(), match_id uuid, home_points int, away_points int, deleted_at timestamptz);
    create table match_confirmations (id uuid default gen_random_uuid(), match_id uuid, side match_side, captain_player_id uuid, confirmed_at timestamptz default now(), deleted_at timestamptz);
    create table match_sheet_audit_logs (id uuid default gen_random_uuid(), match_id uuid, game_id uuid, entity_type text, entity_id uuid, field_name text, operation text, old_value jsonb, new_value jsonb, actor_user_id uuid, actor_player_id uuid, actor_role text, actor_team_season_id uuid, source text, request_id uuid);
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261013090000_atomic_match_summary_rpc.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261016210000_confirmed_numeric_match_cells.sql", import.meta.url), "utf8").replaceAll("errcode = 'PT409'", "errcode = '40001'"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261016220000_non_retryable_match_sheet_conflicts.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261016220000_non_retryable_match_sheet_conflicts.sql", import.meta.url), "utf8"));
  const { rows } = await db.query("select pg_get_functiondef(oid) as definition from pg_proc where proname = 'match_sheet_commit_numeric_cell'");
  assert.ok(rows[0].definition.includes("PT409"));
  assert.ok(!rows[0].definition.includes("40001"));
});
beforeEach(async () => {
  await db.exec("truncate matches, match_games, match_game_players, match_game_achievements, match_results, match_confirmations, match_sheet_audit_logs;");
  await db.query("insert into matches (id) values ($1)", [match]);
  await db.query("insert into match_games (id,match_id,order_number,game_type,home_legs,away_legs,winner_side) values ($1,$2,1,'singles',3,1,'home')", [game, match]);
  await db.query("insert into match_game_players (match_game_id,player_id,side) values ($1,$2,'home')", [game, player]);
  await db.query("insert into match_game_achievements (match_id,match_game_id,player_id,achievement_type,achievement_count) values ($1,$2,$3,'score_95_plus',4)", [match, game, player]);
});
after(() => db.close());
async function currentGame() { return (await db.query("select *, updated_at::text as revision from match_games where id=$1", [game])).rows[0]; }
async function count() { return Number((await db.query("select coalesce(sum(achievement_count),0) as n from match_game_achievements where deleted_at is null")).rows[0].n); }
async function commit(cell, { requestId = randomUUID(), side = "home", staff = false } = {}) {
  return (await db.query("select match_sheet_commit_numeric_cell($1,$2::jsonb,$3::match_side,$4,$4,null,null,'captain',null,'captain_sheet',$5) as game", [match, JSON.stringify(cell), side, staff, requestId])).rows[0].game;
}
const achievement = (n, expected = 4) => ({ type: "achievement", order_number: 1, player_id: player, achievement_type: "score_95_plus", achievement_count: n, expected_count: expected });

test("unchanged fields do not touch rows, create audit entries or recalculate the summary", async () => {
  const before = await currentGame();
  const idsBefore = (await db.query("select id from match_game_achievements where deleted_at is null")).rows;
  await commit({ type: "legs", order_number: 1, away_legs: 1, expected_updated_at: before.revision });
  await commit(achievement(4));
  assert.equal((await currentGame()).revision, before.revision);
  assert.deepEqual((await db.query("select id from match_game_achievements where deleted_at is null")).rows, idsBefore);
  assert.equal((await db.query("select * from match_sheet_audit_logs")).rows.length, 0);
  assert.equal((await db.query("select * from match_results")).rows.length, 0);
});

test("one leg field changes without altering the opponent or achievements", async () => {
  const before = await currentGame();
  await commit({ type: "legs", order_number: 1, away_legs: 2, expected_updated_at: before.revision });
  const after = await currentGame();
  assert.equal(after.home_legs, 3); assert.equal(after.away_legs, 2); assert.equal(await count(), 4);
  const logs = (await db.query("select * from match_sheet_audit_logs where entity_type='match_game'")).rows;
  assert.equal(logs.length, 1); assert.equal(logs[0].field_name, "away_legs");
  assert.equal(logs[0].old_value, 1); assert.equal(logs[0].new_value, 2);
});
test("3:3 is rejected without implicitly resetting the other leg field", async () => {
  await assert.rejects(commit({ type: "legs", order_number: 1, away_legs: 3, expected_updated_at: (await currentGame()).revision }), { code: "22023" });
  assert.equal((await currentGame()).home_legs, 3); assert.equal((await currentGame()).away_legs, 1);
  assert.equal((await db.query("select * from match_sheet_audit_logs")).rows.length, 0);
});
test("a second request using an older leg revision conflicts", async () => {
  const revision = (await currentGame()).revision;
  await commit({ type: "legs", order_number: 1, away_legs: 2, expected_updated_at: revision });
  await assert.rejects(commit({ type: "legs", order_number: 1, home_legs: 0, expected_updated_at: revision }), { code: "PT409" });
  assert.equal((await currentGame()).home_legs, 3);
});
test("stale achievement edits conflict and audit records the actual old value", async () => {
  await commit(achievement(5));
  await assert.rejects(commit(achievement(0)), { code: "PT409" });
  assert.equal(await count(), 5);
  const log = (await db.query("select * from match_sheet_audit_logs where entity_type='match_game_achievement'")).rows[0];
  assert.equal(log.old_value.achievement_count, 4); assert.equal(log.new_value.achievement_count, 5);
});
test("explicit zero is accepted, missing numeric values are rejected", async () => {
  await assert.rejects(commit({ ...achievement(0), achievement_count: undefined }), { code: "22023" });
  assert.equal(await count(), 4);
  await commit(achievement(0)); assert.equal(await count(), 0);
});
test("retry after a lost response cannot roll back a later edit", async () => {
  const requestId = randomUUID();
  await commit(achievement(5), { requestId });
  await commit(achievement(6, 5));
  await commit(achievement(5), { requestId });
  assert.equal(await count(), 6);
  assert.equal((await db.query("select * from match_sheet_audit_logs where entity_type='match_game_achievement'")).rows.length, 2);
});
test("summary failure rolls back data and audit together", async () => {
  await db.exec("alter table match_results add constraint reject_test_summary check (home_points < 0);");
  try {
    await assert.rejects(commit(achievement(5)), { code: "23514" });
    assert.equal(await count(), 4);
    assert.equal((await db.query("select * from match_sheet_audit_logs")).rows.length, 0);
  } finally { await db.exec("alter table match_results drop constraint reject_test_summary;"); }
});
test("captains cannot change opposing achievements or confirmed matches", async () => {
  await assert.rejects(commit(achievement(0), { side: "away" }), { code: "42501" });
  await db.query("update matches set status='confirmed' where id=$1", [match]);
  await assert.rejects(commit(achievement(0)), { code: "42501" });
  assert.equal(await count(), 4);
});
test("confirmed own side is locked; staff corrections preserve confirmations", async () => {
  await db.query("insert into match_confirmations (match_id,side) values ($1,'home')", [match]);
  await assert.rejects(commit(achievement(0)), { code: "42501" });
  await db.query("update matches set status='confirmed' where id=$1", [match]);
  await commit(achievement(5), { staff: true });
  assert.equal(await count(), 5);
  assert.equal((await db.query("select * from match_confirmations where deleted_at is null")).rows.length, 1);
});
test("RPC is executable only by the server service role", async () => {
  const { rows } = await db.query("select has_function_privilege('authenticated', 'match_sheet_commit_numeric_cell(uuid,jsonb,match_side,boolean,boolean,uuid,uuid,text,uuid,text,uuid)', 'execute') as allowed");
  assert.equal(rows[0].allowed, false);
});
