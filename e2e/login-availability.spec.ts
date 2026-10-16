import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const userId = "00000000-0000-4000-8000-000000000002";
function session(expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp })}.test`,
    refresh_token: "test-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer",
    user: { id: userId, aud: "authenticated", role: "authenticated", email: "test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

async function setup(page: Page, baseURL: string, options: {
  token?: (route: Route) => void | Promise<void>;
  profile?: (route: Route) => void | Promise<void>;
  expiredSession?: boolean;
} = {}) {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  if (options.expiredSession) {
    let env = "";
    try { env = readFileSync(".env.local", "utf8"); } catch { /* local placeholder configuration */ }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1] ?? "https://placeholder.supabase.co";
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`, value: session(true),
    });
  }
  // All Supabase calls are mocked; no credentials are sent to a real service.
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/token") {
      if (options.token) { await options.token(route); return; }
      await route.fulfill({ json: session() }); return;
    }
    await route.abort();
  });
  await page.routeWebSocket(/supabase/, (socket) => socket.close());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      if (options.profile) { await options.profile(route); return; }
      await route.fulfill({ json: { user: { displayName: "Test", role: "player", isActive: true, canAccessAdmin: false, canManageOwnTeam: false } } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function submit(page: Page) {
  await page.goto("/prihlaseni");
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Heslo", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
}

test("successful authentication still opens the player account", async ({ page, baseURL }) => {
  await setup(page, baseURL!);
  await submit(page);
  await expect(page).toHaveURL(/\/muj-ucet$/);
});

test("a database outage after authentication keeps the form usable and does not claim a wrong password", async ({ page, baseURL }) => {
  await setup(page, baseURL!, { profile: (route) => route.fulfill({ status: 503, json: { error: "Database unavailable" } }) });
  await submit(page);
  await expect(page.locator("form [role=alert]")).toContainText("Účet se nepodařilo načíst");
  await expect(page.locator("form [role=alert]")).not.toContainText("Zkontrolujte email a heslo");
  await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/prihlaseni$/);
});

test("an auth service outage is distinguished from invalid credentials", async ({ page, baseURL }) => {
  await setup(page, baseURL!, { token: (route) => route.fulfill({ status: 503, json: { message: "Service unavailable" } }) });
  await submit(page);
  await expect(page.locator("form [role=alert]")).toContainText("Přihlašovací služba je dočasně nedostupná");
  await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeEnabled();
});

test("invalid credentials still show the appropriate message", async ({ page, baseURL }) => {
  await setup(page, baseURL!, { token: (route) => route.fulfill({ status: 400, json: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" } }) });
  await submit(page);
  await expect(page.locator("form [role=alert]")).toContainText("Zkontrolujte email a heslo");
  await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeEnabled();
});

test("a stalled auth request times out and late success cannot redirect the user", async ({ page, baseURL }) => {
  await page.clock.install();
  let pending: Route | undefined;
  await setup(page, baseURL!, { token: (route) => { pending = route; } });
  await submit(page);
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.clock.fastForward(13000);
  await expect(page.locator("form [role=alert]")).toContainText("Přihlašovací služba neodpovídá");
  await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeEnabled();
  await pending!.fulfill({ json: session() });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/prihlaseni$/);
});

test("a stalled account request also releases the submit button", async ({ page, baseURL }) => {
  await setup(page, baseURL!, { profile: () => {} });
  await submit(page);
  await expect(page.locator("form [role=alert]")).toContainText("Načítání účtu trvá příliš dlouho", { timeout: 15000 });
  await expect(page.getByRole("button", { name: "Přihlásit se", exact: true })).toBeEnabled();
});

test("a stalled stored-session refresh cannot permanently hide the login link", async ({ page, baseURL }) => {
  await page.clock.install();
  await setup(page, baseURL!, { expiredSession: true, token: () => {} });
  await page.goto("/");
  await expect(page.locator("header").getByText("Načítám...", { exact: true })).toBeVisible();
  await page.clock.fastForward(9000);
  await expect(page.locator("header").getByRole("link", { name: "Přihlášení", exact: true })).toBeVisible();
});

test("a deactivated account is not redirected as a successful login", async ({ page, baseURL }) => {
  await setup(page, baseURL!, { profile: (route) => route.fulfill({ json: { user: { isActive: false, canAccessAdmin: false } } }) });
  await submit(page);
  await expect(page.locator("form [role=alert]")).toContainText("Účet je deaktivovaný", { ignoreCase: true });
  await expect(page).toHaveURL(/\/prihlaseni$/);
});
