import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" } },
    AbortSignal, require(name) {
      if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function setup({ profileError = null, membershipError = null, authError = null, profile = true } = {}) {
  const queries = [];
  const admin = { from(table) {
    queries.push(table);
    const result = table === "user_profiles"
      ? { data: profile ? { id: "profile", player_id: "player", display_name: "Test", app_role: "player", is_active: true } : null, error: profileError }
      : table === "team_memberships" ? { data: [{ id: "membership" }], error: membershipError }
      : { data: null, error: null };
    const query = { select() { return query; }, eq() { return query; }, is() { return query; }, in() { return query; }, limit() { return query; }, abortSignal() { return query; }, maybeSingle() { return Promise.resolve(result); }, returns() { return Promise.resolve(result); } };
    return query;
  } };
  const auth = load("../lib/appAuth.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: authError ? null : { id: "user" } }, error: authError }) } }) },
    "@/lib/supabaseAdmin": { createSupabaseAdminClient: () => admin },
    "@/lib/authTimeout": { withAuthTimeout: (task) => task },
  });
  const route = load("../app/api/auth/me/route.ts", {
    "next/server": { NextResponse: { json: (...args) => Response.json(...args) } },
    "@/lib/appAuth": auth,
    "@/lib/supabaseAdmin": { createSupabaseAdminClient: () => admin },
  });
  return { queries, get: (authenticated = true) => route.GET(new Request("http://localhost/api/auth/me", { headers: authenticated ? { Authorization: "Bearer test" } : {} })) };
}

test("profile database failures return 503 instead of a signed-out 200 response", async () => {
  const fixture = setup({ profileError: { code: "PGRST002" } });
  const response = await fixture.get();
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
  assert.deepEqual(fixture.queries, ["user_profiles"]);
});
test("membership failures do not silently remove captain permissions", async () => {
  const response = await setup({ membershipError: { code: "PGRST002" } }).get();
  assert.equal(response.status, 503);
});
test("authentication outages return 503; invalid credentials remain signed out", async () => {
  assert.equal((await setup({ authError: { status: 503 } }).get()).status, 503);
  const response = await setup({ authError: { status: 401 } }).get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
});
test("an anonymous request makes no database query", async () => {
  const fixture = setup();
  assert.deepEqual(await (await fixture.get(false)).json(), { user: null });
  assert.deepEqual(fixture.queries, []);
});
test("a successful account lookup preserves captain permissions", async () => {
  const response = await setup().get();
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.canManageOwnTeam, true);
  assert.equal(user.canAccessAdmin, true);
  assert.equal(user.canManageAdmin, false);
  assert.equal(user.isActive, true);
});
