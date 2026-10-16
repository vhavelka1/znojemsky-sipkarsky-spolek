import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const matchId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const sheetPath = `/api/admin/matches/${matchId}/sheet`;

async function mockSheet(page: Page, baseURL: string) {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  let env = "";
  try { env = readFileSync(".env.local", "utf8"); } catch { /* placeholder config is supported */ }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1] ?? "https://placeholder.supabase.co";
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(({ storageKey, playerId }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: playerId, exp }))}.test`;
    localStorage.setItem(storageKey, JSON.stringify({ access_token: token, refresh_token: "test", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: playerId, aud: "authenticated", role: "authenticated", email: "test@example.invalid" } }));
    localStorage.setItem("zss:last-auth-activity-at", Date.now().toString());
  }, { storageKey, playerId });
  // No real Supabase HTTP or websocket request is allowed in these tests.
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.routeWebSocket(/supabase/, (socket) => socket.close());
  const payload = {
    match: { id: matchId, home_team_id: "home", away_team_id: "away", scheduled_at: "2026-10-16T17:00:00Z", status: "scheduled" },
    teamSeasons: [{ id: "home", team_id: "ht", display_name: "Domácí" }, { id: "away", team_id: "at", display_name: "Hosté" }],
    teams: [], memberships: [{ team_season_id: "home", player_id: playerId, member_role: "captain" }],
    players: [{ id: playerId, display_name: "Testovací hráč" }],
    games: [{ id: "game", order_number: 1, game_type: "singles", home_legs: 3, away_legs: 1, winner_side: "home", updated_at: "2026-10-16T17:00:00Z", home_player_ids: [playerId], away_player_ids: [], home_slot_codes: ["1"], away_slot_codes: ["A"] }],
    achievements: [{ id: "achievement", order_number: 1, player_id: playerId, achievement_type: "score_95_plus", achievement_count: 4 }],
    viewer: { canManageBothSides: true, side: null }, confirmations: [], lineupReveals: [], statistics: [],
  };
  const writes: Array<Record<string, unknown>> = [];
  let conflict = false;
  let delay = 0;
  let failOnce = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === sheetPath && request.method() === "PATCH") {
      const cell = request.postDataJSON().cell;
      writes.push(cell);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (failOnce) {
        failOnce = false;
        await route.fulfill({ status: 503, json: { error: "Uložení nyní není dostupné." } });
        return;
      }
      if (conflict) {
        payload.games[0].away_legs = 2;
        payload.achievements[0].achievement_count = 6;
        await route.fulfill({ status: 409, json: { error: "Hodnotu mezitím upravil někdo jiný." } });
        return;
      }
      if (cell.type === "legs") Object.assign(payload.games[0], { ...(cell.home_legs !== undefined ? { home_legs: cell.home_legs } : {}), ...(cell.away_legs !== undefined ? { away_legs: cell.away_legs } : {}), updated_at: "2026-10-16T17:01:00Z" });
      if (cell.type === "achievement") payload.achievements[0].achievement_count = cell.achievement.achievement_count;
      await route.fulfill({ json: { game: payload.games[0] } });
      return;
    }
    const body = path === sheetPath ? payload
      : path === "/api/auth/me" ? { user: { displayName: "Test", canAccessAdmin: true, role: "admin", isActive: true, canManageOwnTeam: true } }
      : { permissions: [], pending: {}, requests: [], history: [] };
    await route.fulfill({ json: body });
  });
  await page.goto(`/admin/matches/${matchId}`);
  await expect(page.getByRole("textbox", { name: "Legy domácí hra 1", exact: true })).toHaveValue("3");
  return {
    writes,
    failNextSave: () => { failOnce = true; },
    setConflict: (enabled = true) => { conflict = enabled; },
    changeRemoteStatistic: (value: number) => { payload.achievements[0].achievement_count = value; },
    setDelay: (ms: number) => { delay = ms; },
  };
}

test("focus, unchanged input and a cleared field never write to the database", async ({ page, baseURL }) => {
  const { writes } = await mockSheet(page, baseURL!);
  const field = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await field.focus(); await field.blur();
  await field.fill("1"); await field.blur();
  await field.fill("");
  await page.waitForTimeout(600);
  expect(writes).toHaveLength(0);
  await expect(field).toHaveValue("");
  await field.blur();
  await expect(field).toHaveValue("1");
  expect(writes).toHaveLength(0);
});

test("leaving a changed leg field saves only that field without confirmation buttons", async ({ page, baseURL }) => {
  const { writes } = await mockSheet(page, baseURL!);
  const field = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await field.fill("2");
  await expect(page.getByRole("button", { name: /^Uložit Legy/ })).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(writes).toHaveLength(0);
  await field.blur();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ type: "legs", edited: true, away_legs: 2, expected_updated_at: "2026-10-16T17:00:00Z" });
  expect(writes[0]).not.toHaveProperty("home_legs");
  await expect(field).toBeEnabled();
  await expect(field).toHaveValue("2");
  await expect(page.getByRole("textbox", { name: "Legy domácí hra 1", exact: true })).toHaveValue("3");
});

test("statistics accept an explicit zero; Escape cancels without saving on blur", async ({ page, baseURL }) => {
  const { writes } = await mockSheet(page, baseURL!);
  const field = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await field.fill("9"); await field.press("Escape");
  await expect(field).toHaveValue("4");
  expect(writes).toHaveLength(0);
  await field.fill("0"); await field.blur();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ type: "achievement", expected_count: 4, edited: true, achievement: { achievement_count: 0 } });
  await expect(field).toBeEnabled(); await expect(field).toHaveValue("0");
});

test("a conflict preserves the draft and never retries automatically", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.setConflict();
  const field = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await field.fill("8"); await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Aktuálně" })).toContainText("Aktuálně uloženo: 6");
  await expect(field).toHaveValue("8");
  await field.focus(); await field.blur();
  await page.waitForTimeout(500);
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Použít uloženou hodnotu", exact: true }).click();
  await expect(field).toHaveValue("6");
});

test("Enter followed by blur during a slow save sends only one request", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.setDelay(600);
  const field = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await field.fill("2"); await field.press("Enter"); await field.blur();
  await expect(field).toBeDisabled();
  await expect(field).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
});

test("a fresh direct edit after a conflict uses the current database value as its baseline", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.setConflict();
  const field = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await field.fill("8"); await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Aktuálně" })).toContainText("Aktuálně uloženo: 6");
  fixture.setConflict(false);
  await field.fill("9"); await field.blur();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1]).toMatchObject({ expected_count: 6, achievement: { achievement_count: 9 } });
  expect(fixture.writes[1].request_id).not.toBe(fixture.writes[0].request_id);
  await expect(field).toBeEnabled(); await expect(field).toHaveValue("9");
});

test("a background refresh from another save preserves focused input without sending it", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.setDelay(600);
  const legs = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await legs.fill("2"); await legs.blur();
  await expect(legs).toBeDisabled();
  const statistic = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await statistic.fill("8");
  await expect(legs).toBeEnabled();
  await expect(statistic).toHaveValue("8");
  expect(fixture.writes).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(500);
  expect(fixture.writes).toHaveLength(1);
  await statistic.press("Escape"); await expect(statistic).toHaveValue("4");
});

test("a failed save retains the draft and retries only on request with the same id", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.failNextSave();
  const field = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await field.fill("7"); await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Uložení" })).toBeVisible();
  await expect(field).toHaveValue("7");
  await page.waitForTimeout(500); expect(fixture.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1].request_id).toBe(fixture.writes[0].request_id);
  await expect(field).toBeEnabled(); await expect(field).toHaveValue("7");
  await expect(page.getByRole("alert").filter({ hasText: "Uložení" })).toHaveCount(0);
});

test("retyping the original number cannot overwrite a newer incoming value", async ({ page, baseURL }) => {
  const fixture = await mockSheet(page, baseURL!); fixture.setDelay(600);
  const legs = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await legs.fill("2"); await legs.blur();
  await expect(legs).toBeDisabled();
  const statistic = page.getByRole("textbox", { name: "95+ domácí hra 1", exact: true });
  await statistic.fill(""); await statistic.fill("4");
  fixture.changeRemoteStatistic(6);
  await expect(legs).toBeEnabled();
  await expect(statistic).toHaveValue("4");
  await statistic.blur();
  await expect(statistic).toHaveValue("6");
  expect(fixture.writes).toHaveLength(1);
});

test("mobile fields autosave without confirmation controls and reject invalid input", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mockSheet(page, baseURL!);
  const field = page.getByRole("textbox", { name: "Legy hosté hra 1", exact: true });
  await field.fill("abc"); await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Zadejte celé číslo" })).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Použít uloženou hodnotu", exact: true }).click();
  await expect(field).toHaveValue("1");
  await field.fill("2");
  await expect(page.getByRole("button", { name: /^Uložit Legy/ })).toHaveCount(0);
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("autosave-fields-mobile.png") });
  await field.blur();
  await expect.poll(() => fixture.writes.length).toBe(1);
});
