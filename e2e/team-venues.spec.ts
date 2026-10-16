import { expect, test } from "@playwright/test";

test("captain adds venues in the profile and selects the venue of a home match", async ({ page }) => {
  let homeVenues = ["Hospoda A, Znojmo"];
  let override: string | null = null;
  const match = (home: boolean) => ({
    id: home ? "home-match" : "away-match", teamSeasonId: "team-season", seasonId: "season",
    seasonName: "2026/2027", roundNumber: home ? 1 : 2, scheduledAt: "2026-11-01T18:00:00Z",
    playedAt: null, status: "scheduled", statusLabel: "naplánováno", side: home ? "Domácí" : "Hosté",
    homeTeamName: home ? "Náš tým" : "Soupeř", awayTeamName: home ? "Soupeř" : "Náš tým",
    opponentName: "Soupeř", result: null,
    venue: home ? override ?? homeVenues[0] : "Místo soupeře",
    venueOverride: home ? override : null, availableVenues: home ? homeVenues : ["Místo soupeře"],
    canChangeVenue: home,
  });
  await page.route("**/api/captain/team", async (route) => {
    if (route.request().method() === "PATCH") {
      homeVenues = route.request().postDataJSON().home_venues;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: {
      activeSeasonId: "season", seasons: [{ id: "season", name: "2026/2027", isActive: true }],
      team: { id: "team", teamSeasonId: "team-season", name: "Náš tým", logoUrl: null,
        publicDescription: "", homeVenue: homeVenues[0], homeVenues, publicContactEmail: "", websiteUrl: "",
        seasonName: "2026/2027", registrationStatus: "draft", registrationNote: "", registrationAdminNote: "",
        publicDetailHref: "/tymy/team", rosterHref: "/muj-tym/soupiska", competitionHref: "/tabulky" },
      matches: [match(true), match(false)],
    } });
  });
  await page.route("**/api/captain/matches/home-match/venue", async (route) => {
    override = route.request().postDataJSON().venue;
    await route.fulfill({ json: { venue: override ?? homeVenues[0], venueOverride: override } });
  });
  await page.goto("/muj-tym/zapasy");
  await expect(page.getByText("Hrací místo: Hospoda A, Znojmo", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Změnit hrací místo")).toHaveCount(0);
  await page.goto("/muj-tym/profil");
  await expect(page.getByLabel("Výchozí hrací místo", { exact: true })).toHaveValue(homeVenues[0]);
  await page.getByRole("button", { name: "Přidat hrací místo" }).click();
  await page.getByLabel("Hrací místo 2", { exact: true }).fill("Klubovna B, Znojmo");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByText("Údaje týmu byly uloženy.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Hrací místo 2", { exact: true })).toHaveValue("Klubovna B, Znojmo");
  await page.goto("/muj-tym/zapasy");
  const home = page.locator("article").filter({ hasText: "2026/2027 / 1. kolo" });
  const away = page.locator("article").filter({ hasText: "2026/2027 / 2. kolo" });
  await expect(home.getByText("Hrací místo: Hospoda A, Znojmo", { exact: true })).toBeVisible();
  await expect(away.getByText("Hrací místo: Místo soupeře", { exact: true })).toBeVisible();
  await expect(away.getByLabel("Změnit hrací místo")).toHaveCount(0);
  await home.getByLabel("Změnit hrací místo").selectOption("Klubovna B, Znojmo");
  await expect(home.getByText("Hrací místo: Klubovna B, Znojmo", { exact: true })).toBeVisible();
  await page.reload();
  await expect(home.getByLabel("Změnit hrací místo")).toHaveValue("Klubovna B, Znojmo");
  await home.getByLabel("Změnit hrací místo").selectOption("");
  await expect(home.getByText("Hrací místo: Hospoda A, Znojmo", { exact: true })).toBeVisible();
});
