import { expect, test } from "@playwright/test";

test("admin preserves existing venues, adds and removes venues, and creates a team with multiple venues", async ({ page }) => {
  process.loadEnvFile(".env.local");
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "admin@example.test", aud: "authenticated", role: "authenticated" };
  await page.addInitScript(({ key, user }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "test-access-token", refresh_token: "test-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user }));
  }, { key: `sb-${project}-auth-token`, user });
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: user }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { displayName: "Test admin", role: "admin", isActive: true, canAccessAdmin: true, canManageOwnTeam: false } } }));
  await page.route("**/api/auth/admin-permissions", (route) => route.fulfill({ json: { permissions: [{ href: "/admin/teams", label: "Týmy", minimumRole: "admin" }] } }));
  await page.route("**/api/admin/request-status", (route) => route.fulfill({ json: { pending: {} } }));
  const teams = [{ id: "team", name: "Draci test", slug: "draci-test", logo_url: null,
    playing_venue_address: "Hospoda A", additional_playing_venues: ["Klubovna B"], created_at: "2026-01-01", updated_at: "2026-01-01", deleted_at: null }];
  await page.route("**/api/admin/teams", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      teams.push({ ...teams[0], id: "new", name: body.name, slug: "novy", playing_venue_address: body.home_venues[0], additional_playing_venues: body.home_venues.slice(1) });
      await route.fulfill({ status: 201, json: { team: teams[1] } });
    } else {
      await route.fulfill({ json: { teams, activeSeason: null, teamSeasons: [], memberships: [], players: [] } });
    }
  });
  await page.route("**/api/admin/teams/team", async (route) => {
    const body = route.request().postDataJSON();
    teams[0] = { ...teams[0], name: body.name, playing_venue_address: body.home_venues[0], additional_playing_venues: body.home_venues.slice(1) };
    await route.fulfill({ json: { team: teams[0] } });
  });
  await page.goto("/admin/teams");
  const team = page.locator("article").filter({ hasText: "draci-test" });
  await expect(team.getByText("Hrací místo 2: Klubovna B", { exact: true })).toBeVisible();
  await team.getByRole("button", { name: "Upravit", exact: true }).click();
  await expect(team.getByLabel("Hrací místo 2", { exact: true })).toHaveValue("Klubovna B");
  await team.getByRole("button", { name: "Přidat hrací místo" }).click();
  await team.getByLabel("Hrací místo 3", { exact: true }).fill("Sál C");
  await team.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(team.getByText("Hrací místo 3: Sál C", { exact: true })).toBeVisible();
  await page.reload();
  await team.getByRole("button", { name: "Upravit", exact: true }).click();
  await team.getByRole("button", { name: "Odebrat hrací místo 1", exact: true }).click();
  await expect(team.getByLabel("Výchozí hrací místo", { exact: true })).toHaveValue("Klubovna B");
  await team.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(team.getByText("Výchozí hrací místo: Klubovna B", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit tým", exact: true }).click();
  const form = page.locator("form");
  await form.getByLabel("Název týmu").fill("Nový tým");
  await form.getByLabel("Výchozí hrací místo").fill("Místo 1");
  await form.getByRole("button", { name: "Přidat hrací místo" }).click();
  await form.getByLabel("Hrací místo 2", { exact: true }).fill("Místo 2");
  await form.getByRole("button", { name: "Uložit tým", exact: true }).click();
  const created = page.locator("article").filter({ hasText: "Nový tým" });
  await expect(created.getByText("Výchozí hrací místo: Místo 1", { exact: true })).toBeVisible();
  await expect(created.getByText("Hrací místo 2: Místo 2", { exact: true })).toBeVisible();
});
