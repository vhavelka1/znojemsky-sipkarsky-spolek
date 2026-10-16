import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadSource(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

const venues = loadSource("lib/teamVenues.ts");

test("admin venue lists are validated, normalized and deduplicated", () => {
  assert.equal(JSON.stringify(venues.parseTeamVenueList([" A ", "B", "A", ""])), '["A","B"]');
  for (const invalid of [null, "A", [12], ["A".repeat(501)], Array(21).fill("A")]) {
    assert.equal(venues.parseTeamVenueList(invalid), null);
  }
  assert.equal(JSON.stringify(venues.parseTeamVenueList([""])), '[]');
});

test("admin update stores all venues; legacy updates preserve additional venues", async () => {
  const updates = [];
  const supabase = { from(table) {
    const q = {
      update(value) { updates.push({ table, value }); return q; },
      select() { return q; }, eq() { return q; }, is() { return q; },
      async single() { return { data: { id: "team", playing_venue_address: updates.at(-1).value.playing_venue_address }, error: null }; },
      async maybeSingle() { return { data: null, error: null }; },
    };
    return q;
  } };
  const route = loadSource("app/api/admin/teams/[id]/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/teamVenues": venues,
    "@/lib/appAuth": { requireModeratorOrAdmin: async () => ({ response: null }) },
    "@/lib/supabaseAdmin": { createSupabaseAdminClient: () => supabase },
  });
  const patch = (body) => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id: "team" }) });
  assert.equal((await patch({ name: "Tým", home_venues: [" A ", "B", "A"] })).status, 200);
  assert.equal(updates[0].value.playing_venue_address, "A");
  assert.equal(JSON.stringify(updates[0].value.additional_playing_venues), '["B"]');
  assert.equal((await patch({ name: "Tým", playing_venue_address: "C" })).status, 200);
  assert.equal('additional_playing_venues' in updates[1].value, false);
  assert.equal((await patch({ name: "Tým", home_venues: [123] })).status, 400);
  assert.equal(updates.length, 2);
});

test("existing single venue is the default; legacy season venue remains supported", () => {
  assert.equal(venues.teamVenues({ playing_venue_address: "Hospoda A" })[0], "Hospoda A");
  assert.equal(venues.teamVenues(null, "Staré místo")[0], "Staré místo");
  assert.equal(venues.matchVenue(null, "Hospoda A"), "Hospoda A");
});

test("multiple venues retain order, trim whitespace and remove empty or duplicate entries", () => {
  assert.equal(JSON.stringify(venues.teamVenues({ playing_venue_address: " A ", additional_playing_venues: ["B", " A", "", " C "] })), '["A","B","C"]');
});

test("manual assignment survives changing or removing a venue; null follows the new default", () => {
  assert.equal(venues.matchVenue("Hospoda B", "Nové místo"), "Hospoda B");
  assert.equal(venues.matchVenue(null, "Nové místo"), "Nové místo");
  assert.equal(venues.matchVenue(null, null), null);
});

function routeFixture({ denied = false, status = "scheduled", saved = true } = {}) {
  const updates = [];
  const authCalls = [];
  const supabase = { from(table) {
    let updating = false;
    const query = {
      select() { return query; },
      eq() { return query; },
      is() { return query; },
      update(value) { updating = true; updates.push(value); return query; },
      async single() {
        if (table === "matches") return { data: { home_team_id: "home", status }, error: null };
        if (table === "team_seasons") return { data: { team_id: "team", home_venue: null }, error: null };
        return { data: { playing_venue_address: "A", additional_playing_venues: ["B"] }, error: null };
      },
      async maybeSingle() { assert.ok(updating); return { data: saved ? { id: "match" } : null, error: null }; },
    };
    return query;
  } };
  const route = loadSource("app/api/captain/matches/[id]/venue/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/teamVenues": venues,
    "@/lib/matchAccess": { authorizeMatchAccess: async (...args) => {
      authCalls.push(args);
      return { supabase, match: { home_team_id: "home" }, response: denied ? { status: 403 } : null };
    } },
  });
  return { updates, authCalls, patch: (venue) => route.PATCH({ json: async () => ({ venue }) }, { params: Promise.resolve({ id: "match" }) }) };
}

test("venue changes require home-side authorization and stop on denied access", async () => {
  const fixture = routeFixture({ denied: true });
  assert.equal((await fixture.patch("B")).status, 403);
  assert.equal(fixture.authCalls[0][2].side, "home");
  assert.equal(fixture.updates.length, 0);
});

test("select an additional venue, then restore the default", async () => {
  const fixture = routeFixture();
  assert.equal((await fixture.patch("B")).body.venue, "B");
  const restored = await fixture.patch(null);
  assert.equal(restored.body.venue, "A");
  assert.equal(fixture.updates[1].venue_override, null);
});

test("reject addresses outside the home team list and malformed input", async () => {
  const fixture = routeFixture();
  for (const value of ["C", "", 123, undefined, {}]) assert.equal((await fixture.patch(value)).status, 400);
  assert.equal(fixture.updates.length, 0);
});

test("finished and cancelled matches cannot change venue", async () => {
  for (const status of ["played", "confirmed", "awaiting_confirmation", "cancelled"]) {
    const fixture = routeFixture({ status });
    assert.equal((await fixture.patch("B")).status, 409);
    assert.equal(fixture.updates.length, 0);
  }
});

test("concurrent match changes produce a conflict instead of reporting success", async () => {
  assert.equal((await routeFixture({ saved: false }).patch("B")).status, 409);
});
