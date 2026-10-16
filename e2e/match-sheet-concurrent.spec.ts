import { existsSync, readFileSync } from "node:fs";
import { Browser, BrowserContext, Locator, Page, TestInfo, expect, test } from "@playwright/test";
import { createIsolatedMatchFixture, IsolatedMatchFixture, shouldUseIsolatedMatch } from "./match-sheet-fixture";

let matchId = "d18533e4-63bf-412d-9bb8-79bf54703005";
const productionAllowedMatchId = "d18533e4-63bf-412d-9bb8-79bf54703005";
let matchPath = `/muj-tym/zapasy/${matchId}`;
let sheetApiPath = `/api/admin/matches/${matchId}/sheet`;
let expectedHomeTeamName = "DC Kohouti Mackovice";
let expectedAwayTeamName = "DC KOBRY IVANČICE";

type AchievementType = "score_95_plus" | "score_133_plus" | "score_171_plus";
type Side = "home" | "away";

type Credentials = {
  email: string;
  password: string;
};

type ActorConfig = {
  key: "kohouti-1" | "kohouti-2" | "kobry";
  credentials: Credentials;
  targetPreference: AchievementTargetPreference;
};

type ActorSession = ActorConfig & {
  context: BrowserContext;
  page: Page;
  target: AchievementTarget;
};

type AchievementTarget = {
  orderNumber: number;
  side: Side;
  type: AchievementType;
};

type AchievementTargetPreference = {
  side: Side;
  type: AchievementType;
};

type RecordedValue = AchievementTarget & {
  tester: ActorConfig["key"];
  originalValue: number;
  testValue: number;
};

type PlayerLineupTarget = {
  orderNumber: number;
  side: Side;
};

type RecordedPlayerLineup = PlayerLineupTarget & {
  tester: ActorConfig["key"];
  originalValue: string;
  testValue: string;
  testPlayerLabel: string;
};

type DatabaseConfirmation = "not-production" | "production" | "staging";

class SafeAbortError extends Error {
  tester: string;
  step: string;

  constructor(message: string, options: { step?: string; tester?: string } = {}) {
    super(message);
    this.name = "SafeAbortError";
    this.tester = options.tester ?? "all testers";
    this.step = options.step ?? "runtime safety check";
  }
}

const achievementLabels: Record<AchievementType, string> = {
  score_95_plus: "95+",
  score_133_plus: "133+",
  score_171_plus: "171+",
};

const firstBlockSinglesOrders = [1, 2, 3, 4];

const actorConfigs: ActorConfig[] = [
  {
    key: "kohouti-1",
    credentials: credentialsFromEnv("ZSS_E2E_KOHOUTI_1"),
    targetPreference: { side: "home", type: "score_95_plus" },
  },
  {
    key: "kohouti-2",
    credentials: credentialsFromEnv("ZSS_E2E_KOHOUTI_2"),
    targetPreference: { side: "home", type: "score_133_plus" },
  },
  {
    key: "kobry",
    credentials: credentialsFromEnv("ZSS_E2E_KOBRY"),
    targetPreference: { side: "away", type: "score_171_plus" },
  },
];

test.describe("captain match sheet concurrent autosave", () => {
  test("preserves lineup reveal and concurrent achievement edits after reload", async ({ browser }, testInfo) => {
    skipUnlessSafeToMutate();

    let isolatedFixture: IsolatedMatchFixture | null = null;
    const sessions = await createSessions(browser);
    const recordedValues: RecordedValue[] = [];
    const recordedLineups: RecordedPlayerLineup[] = [];
    const irreversibleSteps: string[] = [];
    let safeAbort: SafeAbortError | null = null;

    try {
      isolatedFixture = await prepareMatchUnderTest(testInfo);
      await Promise.all(sessions.map((session) => openMatchFromCaptainSection(session)));

      await logPhase(testInfo, "1-baseline", sessions, "Opened all three captain sessions and captured the initial match-sheet state.");
      await recordAndChangeLineups(sessions, recordedLineups, testInfo);

      await logPhase(testInfo, "2-hidden-opponent-lineups", sessions, "Checking that opponent lineups are still hidden before lineup reveal.");
      await assertOpponentLineupsHidden(sessions, recordedLineups);

      await reloadAllSessions(sessions, "after lineup edits before reveal");
      await assertLineupsPreserved(sessions, recordedLineups, "after lineup edit reload");

      await revealFirstBlockIfPossible(sessions, recordedLineups, irreversibleSteps, testInfo);
      await reloadAllSessions(sessions, "after lineup reveal");
      await assertLineupsPreserved(sessions, recordedLineups, "after reveal reload");

      await logPhase(testInfo, "7-concurrent-achievements", sessions, "Selecting editable achievement fields after lineup visibility and preparing concurrent saves.");
      await assignEditableTargets(sessions);
      await assertSelectedTargetsAreVisibleForAllSessions(sessions);

      for (const session of sessions) {
        const originalValue = await readAchievementValue(session.page, session.target);
        recordedValues.push({
          ...session.target,
          tester: session.key,
          originalValue,
          testValue: nextTestValue(originalValue),
        });
      }

      await setAchievementsConcurrently(sessions, recordedValues);

      await logPhase(testInfo, "8-post-achievement-verification", sessions, "Verifying that lineups and achievements are present before final reload.");
      await assertLineupsPreserved(sessions, recordedLineups, "after achievement saves");
      for (const session of sessions) {
        await expectAllValues(session.page, recordedValues, "after concurrent save before reload");
      }

      await reloadAllSessions(sessions, "final verification reload");
      await assertLineupsPreserved(sessions, recordedLineups, "after final reload");
      for (const session of sessions) {
        await expectAllValues(session.page, recordedValues, "after concurrent save");
      }
    } catch (error) {
      if (error instanceof SafeAbortError) {
        safeAbort = error;
      } else {
        await attachFailureDiagnostics(sessions, testInfo, error);
        throw error;
      }
    } finally {
      try {
        if (shouldRestoreAfterTest() && recordedValues.length > 0) {
          await restoreOriginalValues(sessions, recordedValues, testInfo);
        }
        if (shouldRestoreAfterTest() && recordedLineups.length > 0) {
          await restoreOriginalLineups(sessions, recordedLineups, testInfo);
        }
        if (irreversibleSteps.length > 0) {
          await testInfo.attach("irreversible-lineup-reveal-warning.txt", {
            body: [
              "The test performed lineup reveal actions that are not reversible through the UI cleanup.",
              ...irreversibleSteps,
            ].join("\n"),
            contentType: "text/plain",
          });
        }
      } finally {
        const cleanupErrors: string[] = [];
        try {
          await closeSessions(sessions);
        } catch (error) {
          cleanupErrors.push(`browser cleanup failed: ${errorMessage(error)}`);
        }
        try {
          await isolatedFixture?.cleanup();
        } catch (error) {
          cleanupErrors.push(`isolated DB cleanup failed: ${errorMessage(error)}`);
        }
        if (cleanupErrors.length > 0) {
          await testInfo.attach("cleanup-error.txt", {
            body: cleanupErrors.join("\n\n"),
            contentType: "text/plain",
          });
          throw new Error(cleanupErrors.join("\n\n"));
        }
      }
    }

    if (safeAbort) {
      skipWithDiagnostic(true, {
        reason: safeAbort.message,
        step: safeAbort.step,
        tester: safeAbort.tester,
      });
    }
  });
});

async function prepareMatchUnderTest(testInfo: TestInfo) {
  if (!shouldUseIsolatedMatch()) {
    resetStaticMatchUnderTest();
    return null;
  }

  const fixture = await createIsolatedMatchFixture(actorConfigs, testInfo);
  matchId = fixture.matchId;
  matchPath = `/muj-tym/zapasy/${matchId}`;
  sheetApiPath = `/api/admin/matches/${matchId}/sheet`;
  expectedHomeTeamName = fixture.homeTeamName;
  expectedAwayTeamName = fixture.awayTeamName;
  return fixture;
}

function resetStaticMatchUnderTest() {
  matchId = productionAllowedMatchId;
  matchPath = `/muj-tym/zapasy/${matchId}`;
  sheetApiPath = `/api/admin/matches/${matchId}/sheet`;
  expectedHomeTeamName = "DC Kohouti Mackovice";
  expectedAwayTeamName = "DC KOBRY IVANČICE";
}

function credentialsFromEnv(prefix: string): Credentials {
  return {
    email: process.env[`${prefix}_EMAIL`] ?? "",
    password: process.env[`${prefix}_PASSWORD`] ?? "",
  };
}

function skipUnlessSafeToMutate() {
  skipWithDiagnostic(process.env.ZSS_E2E_ALLOW_MATCH_MUTATION !== "true", {
    reason: "Set ZSS_E2E_ALLOW_MATCH_MUTATION=true to allow this test to temporarily mutate and restore the match sheet.",
    step: "preflight mutation opt-in",
    tester: "all testers",
  });

  const baseURL = process.env.ZSS_E2E_BASE_URL ?? "http://127.0.0.1:3000";
  const { hostname } = new URL(baseURL);
  const databaseConfirmation = process.env.ZSS_E2E_DATABASE_CONFIRMATION;
  const allowedDatabaseConfirmations: DatabaseConfirmation[] = ["not-production", "production", "staging"];
  skipWithDiagnostic(!allowedDatabaseConfirmations.includes(databaseConfirmation as DatabaseConfirmation), {
    reason: `Set ZSS_E2E_DATABASE_CONFIRMATION=staging for isolated E2E, not-production for local-only legacy runs, or production for the explicitly approved production match. Detected Supabase host: ${detectedSupabaseHost()}.`,
    step: "preflight database confirmation",
    tester: "all testers",
  });

  if (databaseConfirmation === "not-production") {
    skipWithDiagnostic(!["localhost", "127.0.0.1", "::1"].includes(hostname), {
      reason: "Non-production mode is guarded to local base URLs only. Point ZSS_E2E_BASE_URL at a local app instance.",
      step: "preflight non-production base URL",
      tester: "all testers",
    });
  }

  if (databaseConfirmation === "production") {
    skipWithDiagnostic(shouldUseIsolatedMatch(), {
      reason: "Isolated match E2E is not allowed in production mode.",
      step: "preflight production isolation guard",
      tester: "all testers",
    });
    skipWithDiagnostic(matchId !== productionAllowedMatchId, {
      reason: `Production mode is only allowed for match ${productionAllowedMatchId}; this test is configured for ${matchId}.`,
      step: "preflight production match allowlist",
      tester: "all testers",
    });
  }

  if (databaseConfirmation === "staging") {
    skipWithDiagnostic(!shouldUseIsolatedMatch(), {
      reason: "Staging mode requires ZSS_E2E_USE_ISOLATED_MATCH=true so the test creates and cleans up its own match.",
      step: "preflight staging isolation guard",
      tester: "all testers",
    });
    skipWithDiagnostic(!["localhost", "127.0.0.1", "::1"].includes(hostname), {
      reason: "Staging E2E must run against a local app instance pointed at the staging Supabase project.",
      step: "preflight staging base URL",
      tester: "all testers",
    });
    skipWithDiagnostic(detectedSupabaseHost() === "edcilogoqicbygtywbzq.supabase.co", {
      reason: "Refusing to run staging E2E against the known production Supabase host.",
      step: "preflight staging database host",
      tester: "all testers",
    });
  }

  const missing = actorConfigs.flatMap((actor) => {
    const prefix =
      actor.key === "kobry"
        ? "ZSS_E2E_KOBRY"
        : actor.key === "kohouti-1"
          ? "ZSS_E2E_KOHOUTI_1"
          : "ZSS_E2E_KOHOUTI_2";
    return [
      actor.credentials.email ? null : `${prefix}_EMAIL`,
      actor.credentials.password ? null : `${prefix}_PASSWORD`,
    ].filter(Boolean);
  });

  skipWithDiagnostic(missing.length > 0, {
    reason: `Missing required local environment variables: ${missing.join(", ")}`,
    step: "preflight credentials",
    tester: "all testers",
  });
}

function databaseConfirmationMode() {
  return process.env.ZSS_E2E_DATABASE_CONFIRMATION as DatabaseConfirmation | undefined;
}

function shouldRestoreAfterTest() {
  return process.env.ZSS_E2E_SKIP_RESTORE !== "true";
}

function skipWithDiagnostic(
  condition: boolean,
  details: { reason: string; step: string; tester: string },
) {
  if (condition) {
    const message = `[match-sheet-concurrent] skipped tester="${details.tester}" step="${details.step}" reason="${details.reason}"`;
    console.warn(message);
    test.skip(true, message);
  }
}

function detectedSupabaseHost() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readDotEnvLocalValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl) return "unknown";

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return "invalid NEXT_PUBLIC_SUPABASE_URL";
  }
}

function readDotEnvLocalValue(key: string) {
  if (!existsSync(".env.local")) return null;

  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));
  if (!line) return null;

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

async function createSessions(browser: Browser): Promise<ActorSession[]> {
  return Promise.all(
    actorConfigs.map(async (actor) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      return { ...actor, context, page, target: { ...actor.targetPreference, orderNumber: 0 } };
    }),
  );
}

async function openMatchFromCaptainSection(session: ActorSession) {
  await login(session.page, session.credentials, session.key);
  await session.page.goto("/muj-tym/zapasy", { waitUntil: "networkidle" });

  const matchLink = await visibleMatchSheetLink(session.page, session.key);
  await matchLink.click();
  await session.page.waitForURL((url) => url.pathname === matchPath, { timeout: 15_000 });
  await session.page.waitForLoadState("networkidle");
  await assertExpectedMatchLoaded(session.page);
}

async function login(page: Page, credentials: Credentials, tester: ActorSession["key"]) {
  await page.goto("/prihlaseni", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Heslo").fill(credentials.password);
  await page.getByRole("button", { name: /Přihlásit se|Přihlašuji/ }).click();
  await page.waitForURL((url) => url.pathname !== "/prihlaseni", { timeout: 20_000 }).catch(() => {
    throw new SafeAbortError("Login did not complete. Check local credentials and account access.", {
      step: "login",
      tester,
    });
  });
}

async function assertExpectedMatchLoaded(page: Page) {
  expect(new URL(page.url()).pathname).toBe(matchPath);
  await expect(page.getByText(expectedHomeTeamName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(expectedAwayTeamName, { exact: true }).first()).toBeVisible();
}

async function logPhase(testInfo: TestInfo, name: string, sessions: ActorSession[], note: string) {
  const lines = [
    `[match-sheet-concurrent] phase="${name}" note="${note}"`,
    ...sessions.map((session) => `${session.key}: ${session.page.url()}`),
  ];
  console.warn(lines.join("\n"));
  await testInfo.attach(`${name}.txt`, {
    body: lines.join("\n"),
    contentType: "text/plain",
  });
}

async function reloadAllSessions(sessions: ActorSession[], step: string) {
  await Promise.all(sessions.map((session) => session.page.reload({ waitUntil: "networkidle" })));
  await Promise.all(sessions.map((session) => assertExpectedMatchLoaded(session.page)));
  console.warn(`[match-sheet-concurrent] reloaded all sessions step="${step}"`);
}

async function recordAndChangeLineups(
  sessions: ActorSession[],
  records: RecordedPlayerLineup[],
  testInfo: TestInfo,
) {
  await logPhase(testInfo, "2-home-lineup-edits", sessions, "Kohouti sessions ensure all home players are assigned in the first singles block.");
  const usedHomeRows = new Set<number>();
  const usedAwayRows = new Set<number>();
  const kohoutiOne = sessionByKey(sessions, "kohouti-1");
  const kohoutiTwo = sessionByKey(sessions, "kohouti-2");
  const kobry = sessionByKey(sessions, "kobry");

  await ensureFirstBlockLineupComplete(kohoutiOne, "home", usedHomeRows, records);
  await reloadAllSessions([kohoutiTwo], "kohouti-2 sees complete home lineup");

  await logPhase(testInfo, "3-away-lineup-edits", sessions, "Kobry ensure all away players are assigned in the first singles block.");
  await ensureFirstBlockLineupComplete(kobry, "away", usedAwayRows, records);

  await assertLineupsPreserved(sessions, records, "after initial lineup edits");
}

async function ensureFirstBlockLineupComplete(
  session: ActorSession,
  side: Side,
  usedRows: Set<number>,
  records: RecordedPlayerLineup[],
) {
  for (const orderNumber of firstBlockSinglesOrders) {
    const target = { orderNumber, side };
    const select = playerSelect(session.page, target);
    if ((await select.count()) !== 1 || !(await select.isVisible()) || !(await select.isEnabled())) {
      throw new SafeAbortError(
        [
          `${session.key} cannot prepare ${side} lineup for row ${orderNumber}.`,
          "The first singles block must have one editable player select per side before lineup reveal can be verified safely.",
          await firstBlockPreparationState(session.page, side),
        ].join("\n"),
        {
          step: "first block lineup preparation",
          tester: session.key,
        },
      );
    }

    const currentValue = await select.inputValue();
    if (currentValue !== "") {
      usedRows.add(orderNumber);
      records.push(await recordExistingPlayerSlot(session, target, currentValue));
      continue;
    }

    records.push(await recordAndSetEmptyPlayerSlot(session, side, usedRows));
  }
}

async function recordExistingPlayerSlot(
  session: ActorSession,
  target: PlayerLineupTarget,
  value: string,
): Promise<RecordedPlayerLineup> {
  const select = playerSelect(session.page, target);
  return {
    ...target,
    tester: session.key,
    originalValue: value,
    testValue: value,
    testPlayerLabel: await playerOptionLabel(select, value),
  };
}

async function recordAndSetEmptyPlayerSlot(
  session: ActorSession,
  side: Side,
  usedRows: Set<number>,
): Promise<RecordedPlayerLineup> {
  const target = await findEmptyEditablePlayerTarget(session, side, usedRows);
  const select = playerSelect(session.page, target);
  const originalValue = await select.inputValue();
  const testValue = await firstAvailablePlayerValue(select);
  if (!testValue) {
    throw new SafeAbortError(`${session.key} has no selectable ${side} player for ${lineupTargetName(target)}.`, {
      step: "lineup player option discovery",
      tester: session.key,
    });
  }
  const testPlayerLabel = await playerOptionLabel(select, testValue);

  await setPlayerAndWaitForAutosave(session.page, target, testValue);
  usedRows.add(target.orderNumber);
  return { ...target, tester: session.key, originalValue, testValue, testPlayerLabel };
}

async function findEmptyEditablePlayerTarget(
  session: ActorSession,
  side: Side,
  usedRows: Set<number>,
): Promise<PlayerLineupTarget> {
  for (const orderNumber of firstBlockSinglesOrders) {
    if (usedRows.has(orderNumber)) continue;

    const target = { orderNumber, side };
    const select = playerSelect(session.page, target);
    if ((await select.count()) !== 1) continue;
    if (!(await select.isVisible()) || !(await select.isEnabled())) continue;
    if ((await select.inputValue()) !== "") continue;
    if (!(await firstAvailablePlayerValue(select))) continue;
    return target;
  }

  throw new SafeAbortError(
    `${session.key} cannot find an empty editable ${side} singles lineup slot in the first block. Prepare an unpublished match sheet with empty singles slots before running the full lifecycle test.`,
    {
      step: "lineup empty slot discovery",
      tester: session.key,
    },
  );
}

function playerSelect(page: Page, target: PlayerLineupTarget) {
  return playerCell(page, target).locator("select");
}

function playerCell(page: Page, target: PlayerLineupTarget) {
  return gameRow(page, target.orderNumber).locator(`td:nth-child(${target.side === "home" ? 6 : 8})`);
}

function firstBlockContainer(page: Page) {
  return gameRow(page, 1).locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' overflow-hidden ')][1]",
  );
}

function gameRow(page: Page, orderNumber: number) {
  return page.locator(
    `xpath=//tr[./td[1][normalize-space(.)='${orderNumber}.' or starts-with(normalize-space(.), '${orderNumber}. ')]]`,
  );
}

async function firstAvailablePlayerValue(select: Locator) {
  const options = select.locator("option");
  const count = await options.count();
  for (let index = 0; index < count; index += 1) {
    const value = await options.nth(index).getAttribute("value");
    if (value) return value;
  }
  return null;
}

async function playerOptionLabel(select: Locator, value: string) {
  return select.locator("option").evaluateAll(
    (options, expectedValue) =>
      options.find((option) => (option as HTMLOptionElement).value === expectedValue)?.textContent?.trim() ?? expectedValue,
    value,
  );
}

async function firstBlockPreparationState(page: Page, side: Side) {
  const lines = [`${side} first-block lineup state:`];
  for (const orderNumber of firstBlockSinglesOrders) {
    const select = playerSelect(page, { orderNumber, side });
    const count = await select.count();
    const visible = count === 1 ? await select.isVisible() : false;
    const enabled = count === 1 ? await select.isEnabled() : false;
    const value = count === 1 ? await select.inputValue().catch(() => "unreadable") : "missing";
    lines.push(`  row ${orderNumber}: select=${count}, visible=${visible}, enabled=${enabled}, value=${JSON.stringify(value)}`);
  }
  lines.push(`reveal state: ${await firstBlockRevealStateText(page)}`);
  return lines.join("\n");
}

async function setPlayerAndWaitForAutosave(page: Page, target: PlayerLineupTarget, value: string) {
  const select = playerSelect(page, target);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(sheetApiPath) && response.request().method() === "PATCH",
    { timeout: 20_000 },
  );
  await select.selectOption(value);
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(await autosaveFailureMessage(response, `Lineup autosave failed for ${lineupTargetName(target)}`));
  }
  await expect(page.getByText("Ukládám...", { exact: true })).toHaveCount(0);
  await expect(select).toHaveValue(value);
}

async function assertLineupsPreserved(
  sessions: ActorSession[],
  records: RecordedPlayerLineup[],
  phase: string,
) {
  for (const record of records) {
    const owner = sessions.find((session) => session.key === record.tester && !session.page.isClosed());
    if (!owner) continue;
    await expect(playerSelect(owner.page, record), `${phase}: ${lineupTargetName(record)}`).toHaveValue(record.testValue);
  }
}

async function assertOpponentLineupsHidden(sessions: ActorSession[], records: RecordedPlayerLineup[]) {
  const kohouti = sessionByKey(sessions, "kohouti-1");
  const kobry = sessionByKey(sessions, "kobry");

  for (const record of records.filter((item) => item.side === "away")) {
    await assertOpponentLineupHidden(kohouti.page, record, "kohouti-1");
  }
  for (const record of records.filter((item) => item.side === "home")) {
    await assertOpponentLineupHidden(kobry.page, record, "kobry");
  }
}

async function assertOpponentLineupHidden(page: Page, target: RecordedPlayerLineup, tester: string) {
  const cell = playerCell(page, target);
  await assertSingle(cell, `${tester} opponent ${lineupTargetName(target)} cell`);
  const editableSelects = await cell.locator("select").count();
  if (editableSelects > 0) {
    throw new SafeAbortError(
      `${tester} can already edit opponent lineup ${lineupTargetName(target)} before reveal. The lifecycle scenario requires unpublished opponent lineups.`,
      {
        step: "opponent lineup editable select check",
        tester,
      },
    );
  }

  if (target.testPlayerLabel && await cell.getByText(target.testPlayerLabel, { exact: true }).count() > 0) {
    throw new SafeAbortError(
      `${tester} can already see opponent player "${target.testPlayerLabel}" in ${lineupTargetName(target)} before reveal. The lifecycle scenario requires unpublished opponent lineups.`,
      {
        step: "opponent lineup player visibility check",
        tester,
      },
    );
  }
}

async function assertOpponentLineupsVisibleAfterReveal(sessions: ActorSession[], records: RecordedPlayerLineup[]) {
  const kohouti = sessionByKey(sessions, "kohouti-1");
  const kobry = sessionByKey(sessions, "kobry");
  const missing: string[] = [];

  for (const record of records.filter((item) => item.side === "away")) {
    if (!(await opponentLineupPlayerIsVisible(kohouti.page, record))) {
      missing.push(`kohouti-1 cannot see ${lineupTargetName(record)} player "${record.testPlayerLabel}"`);
    }
  }

  for (const record of records.filter((item) => item.side === "home")) {
    if (!(await opponentLineupPlayerIsVisible(kobry.page, record))) {
      missing.push(`kobry cannot see ${lineupTargetName(record)} player "${record.testPlayerLabel}"`);
    }
  }

  if (missing.length > 0) {
    throw new SafeAbortError(
      [
        "Lineup reveal phase did not make both first-block lineups mutually visible.",
        ...missing,
        "",
        "Current lineup/reveal state:",
        await lineupRevealDebugState(sessions, records),
      ].join("\n"),
      {
        step: "lineup reveal verification",
        tester: "all testers",
      },
    );
  }
}

async function opponentLineupPlayerIsVisible(page: Page, target: RecordedPlayerLineup) {
  const cell = playerCell(page, target);
  if ((await cell.count()) !== 1) return false;
  if ((await cell.locator("select").count()) > 0) return false;
  return (await cell.getByText(target.testPlayerLabel, { exact: true }).count()) > 0;
}

async function lineupRevealDebugState(sessions: ActorSession[], records: RecordedPlayerLineup[]) {
  const lines: string[] = [];
  for (const session of sessions) {
    if (session.page.isClosed()) {
      lines.push(`${session.key}: page closed`);
      continue;
    }

    lines.push(`${session.key}: ${await firstBlockRevealStateText(session.page)}`);
    for (const record of records) {
      const cell = playerCell(session.page, record);
      const cellCount = await cell.count();
      const selectCount = cellCount === 1 ? await cell.locator("select").count() : 0;
      const playerVisible = cellCount === 1
        ? await cell.getByText(record.testPlayerLabel, { exact: true }).count() > 0
        : false;
      const cellText = cellCount === 1 ? (await cell.innerText().catch(() => "")).replace(/\s+/g, " ").trim() : "";
      lines.push(
        `  ${lineupTargetName(record)}: cell=${cellCount}, select=${selectCount}, playerVisible=${playerVisible}, text=${JSON.stringify(cellText)}`,
      );
    }
  }
  return lines.join("\n");
}

async function revealFirstBlockIfPossible(
  sessions: ActorSession[],
  records: RecordedPlayerLineup[],
  irreversibleSteps: string[],
  testInfo: TestInfo,
) {
  await logPhase(testInfo, "5-lineup-reveal", sessions, "Attempting home lineup reveal followed by away lineup reveal when the UI allows it.");
  await revealFirstBlockSideIfPossible(sessionByKey(sessions, "kohouti-1"), "home", irreversibleSteps);
  await reloadAllSessions(sessions, "after home reveal attempt");
  await revealFirstBlockSideIfPossible(sessionByKey(sessions, "kobry"), "away", irreversibleSteps);
  await reloadAllSessions(sessions, "after away reveal attempt");
  await assertOpponentLineupsVisibleAfterReveal(sessions, records);
}

async function revealFirstBlockSideIfPossible(
  session: ActorSession,
  side: Side,
  irreversibleSteps: string[],
) {
  const button = await firstBlockRevealButton(session.page, side);
  if (!button) {
    const state = await firstBlockRevealStateText(session.page);
    console.warn(`[match-sheet-concurrent] no reveal button available tester="${session.key}" side="${side}" state="${state}"`);
    return;
  }

  if (databaseConfirmationMode() === "production") {
    if (process.env.ZSS_E2E_ALLOW_IRREVERSIBLE_LINEUP_REVEAL !== "true") {
      throw new SafeAbortError(
        "Lineup reveal is not reversible through UI cleanup. Set ZSS_E2E_ALLOW_IRREVERSIBLE_LINEUP_REVEAL=true to allow this production step.",
        {
          step: "irreversible lineup reveal opt-in",
          tester: session.key,
        },
      );
    }
  }

  const responsePromise = session.page.waitForResponse(
    (response) => response.url().includes(sheetApiPath) && response.request().method() === "PATCH",
    { timeout: 20_000 },
  );
  await button.click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Lineup reveal failed for ${session.key} ${side} with status ${response.status()}.`);
  }
  irreversibleSteps.push(`${session.key} revealed ${side} lineup for first block.`);
}

async function firstBlockRevealButton(page: Page, side: Side) {
  const sideControl = firstBlockRevealSideControl(page, side);
  if ((await sideControl.count()) !== 1) return null;

  const buttons = sideControl.getByRole("button", { name: "Potvrdit nasazení" });
  const count = await buttons.count();
  if (count === 0) return null;
  return buttons.first();
}

function firstBlockRevealSideControl(page: Page, side: Side) {
  const controls = firstBlockRevealControls(page);
  return controls.locator(`xpath=./div[${side === "home" ? 1 : 2}]`);
}

function firstBlockRevealControls(page: Page) {
  return firstBlockContainer(page).locator(
    "xpath=./div[contains(concat(' ', normalize-space(@class), ' '), ' grid ') and contains(concat(' ', normalize-space(@class), ' '), ' border-t ') and contains(@class, 'sm:grid-cols-2')][count(./div)=2]",
  );
}

async function firstBlockRevealStateText(page: Page) {
  const rowCount = await gameRow(page, 1).count();
  const block = firstBlockContainer(page);
  const blockCount = await block.count();
  const controls = firstBlockRevealControls(page);
  const controlsCount = await controls.count();
  if (controlsCount !== 1) {
    const buttonTexts = blockCount === 1
      ? await block.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ""))
      : [];
    const blockText = blockCount === 1 ? (await block.innerText().catch(() => "")).replace(/\s+/g, " ").trim() : "";
    return [
      "first block reveal controls not found",
      `rowCount=${rowCount}`,
      `blockCount=${blockCount}`,
      `controlsCount=${controlsCount}`,
      `buttons=${JSON.stringify(buttonTexts)}`,
      `blockText=${JSON.stringify(blockText.slice(0, 500))}`,
    ].join("; ");
  }

  const home = await firstBlockRevealSideControl(page, "home").innerText().catch(() => "unreadable home control");
  const away = await firstBlockRevealSideControl(page, "away").innerText().catch(() => "unreadable away control");
  return `home=${JSON.stringify(home.trim())}; away=${JSON.stringify(away.trim())}`;
}

function sessionByKey(sessions: ActorSession[], key: ActorSession["key"]) {
  const session = sessions.find((item) => item.key === key);
  if (!session) throw new Error(`Missing browser session for ${key}.`);
  return session;
}

async function visibleMatchSheetLink(page: Page, actorKey: ActorSession["key"]) {
  const links = page.locator(`a[href*="/muj-tym/zapasy/${matchId}"]`);
  const count = await links.count();
  if (count < 1) {
    throw new SafeAbortError(`Expected at least one ${actorKey} match link in captain section, found none.`, {
      step: "captain match list navigation",
      tester: actorKey,
    });
  }

  const hrefs: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const href = await links.nth(index).getAttribute("href");
    if (!href) {
      throw new SafeAbortError(`Found ${actorKey} match link without href. Aborting before navigation.`, {
        step: "captain match link validation",
        tester: actorKey,
      });
    }
    hrefs.push(href);
  }

  const unexpectedHrefs = hrefs.filter((href) => new URL(href, page.url()).pathname !== matchPath);
  if (unexpectedHrefs.length > 0) {
    throw new SafeAbortError(
      [
        `Found ${actorKey} links containing match ID, but not all lead to the approved match path ${matchPath}.`,
        ...unexpectedHrefs.map((href) => `Unexpected href: ${href}`),
      ].join("\n"),
      {
        step: "captain match link validation",
        tester: actorKey,
      },
    );
  }

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    if (await link.isVisible()) {
      return link;
    }
  }

  throw new SafeAbortError(`Found ${count} ${actorKey} links to ${matchPath}, but none are visible.`, {
    step: "captain match link visibility",
    tester: actorKey,
  });
}

async function assignEditableTargets(sessions: ActorSession[]) {
  const usedSlots = new Set<string>();

  for (const session of sessions) {
    const target = await findEditableAchievementTarget(session, usedSlots);
    session.target = target;
    usedSlots.add(achievementSlotKey(target));
  }
}

async function findEditableAchievementTarget(session: ActorSession, usedSlots: Set<string>): Promise<AchievementTarget> {
  const preference = session.targetPreference;
  const inputs = session.page.getByLabel(achievementInputLabel(preference), { exact: true });
  const count = await inputs.count();

  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    if (!(await input.isVisible()) || !(await input.isEnabled())) continue;

    const orderNumber = await orderNumberForAchievementInput(input);
    if (orderNumber === null || usedSlots.has(achievementSlotKey({ ...preference, orderNumber }))) continue;

    return { ...preference, orderNumber };
  }

  throw new SafeAbortError(
    [
      `${session.key} cannot find an editable ${achievementLabels[preference.type]} field for ${preference.side}.`,
      "The match sheet needs a visible lineup and a selected player in an unused singles row for the same side before achievement statistics can be edited.",
      `Seen ${count} matching inputs; already reserved slots: ${[...usedSlots].join(", ") || "none"}.`,
      `Current reveal state: ${await firstBlockRevealStateText(session.page)}`,
    ].join(" "),
    {
      step: "achievement field discovery",
      tester: session.key,
    },
  );
}

function achievementSlotKey(target: AchievementTargetPreference & { orderNumber: number }) {
  return `${target.side}:${target.orderNumber}`;
}

async function orderNumberForAchievementInput(input: Locator) {
  const label = await input.locator("xpath=ancestor::tr[1]/td[1]").innerText().catch(() => "");
  const match = label.trim().match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

async function assertSelectedTargetsAreVisibleForAllSessions(sessions: ActorSession[]) {
  for (const session of sessions) {
    for (const actor of sessions) {
      await assertSingle(
        achievementInput(session.page, actor.target),
        `${session.key} ${targetName(actor.target)}`,
      );
      if (session.key === actor.key && !(await achievementInput(session.page, actor.target).isEnabled())) {
        throw new SafeAbortError(`${session.key} cannot edit ${targetName(actor.target)}. Aborting before changes.`, {
          step: "achievement field editability",
          tester: session.key,
        });
      }
    }
  }
}

function achievementInput(page: Page, target: AchievementTarget) {
  const row = page.locator(
    `xpath=//tr[./td[1][normalize-space(.)='${target.orderNumber}.' or starts-with(normalize-space(.), '${target.orderNumber}. ')]]`,
  );
  return row.getByLabel(achievementInputLabel(target), { exact: true });
}

function achievementInputLabel(target: AchievementTargetPreference & { orderNumber?: number }) {
  const label = achievementLabels[target.type].replace("+", "\\+");
  return new RegExp(`^${label} ${target.side === "home" ? "domácí" : "hosté"} hra ${target.orderNumber ?? "\\d+"}$`);
}

async function readAchievementValue(page: Page, target: AchievementTarget) {
  const input = achievementInput(page, target);
  const rawValue = await input.inputValue();
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Cannot read numeric value from ${targetName(target)}. Current raw value: ${JSON.stringify(rawValue)}.`);
  }
  return value;
}

async function setAchievementAndWaitForCommit(page: Page, target: AchievementTarget, value: number) {
  const input = achievementInput(page, target);
  await input.fill(String(value));
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(sheetApiPath) && response.request().method() === "PATCH",
    { timeout: 20_000 },
  );
  await input.press("Enter");
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(await autosaveFailureMessage(response, `Autosave failed for ${targetName(target)}`));
  }
  await expect(page.getByText("Ukládám...", { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue(String(value));
}

async function setAchievementsConcurrently(sessions: ActorSession[], values: RecordedValue[]) {
  const prepared = await Promise.all(
    sessions.map(async (session) => {
      const value = values.find((item) => item.tester === session.key && sameTarget(item, session.target));
      if (!value) throw new Error(`Missing recorded value for ${targetName(session.target)}.`);

      const input = achievementInput(session.page, session.target);
      await input.fill(String(value.testValue));
      return { input, session, value };
    }),
  );

  const responsePromises = prepared.map(({ session }) =>
    session.page.waitForResponse(
      (response) => response.url().includes(sheetApiPath) && response.request().method() === "PATCH",
      { timeout: 20_000 },
    ),
  );

  await Promise.all(prepared.map(({ input }) => input.press("Enter")));

  const responses = await Promise.all(responsePromises);
  for (const [index, response] of responses.entries()) {
    if (!response.ok()) {
      throw new Error(await autosaveFailureMessage(response, `Autosave failed for ${targetName(prepared[index].value)}`));
    }
  }

  await Promise.all(
    prepared.map(async ({ input, session, value }) => {
      await expect(session.page.getByText("Ukládám...", { exact: true })).toHaveCount(0);
      await expect(input).toHaveValue(String(value.testValue));
    }),
  );
}

async function autosaveFailureMessage(response: { status: () => number; text: () => Promise<string> }, prefix: string) {
  const body = await response.text().catch((error) => `Unable to read response body: ${errorMessage(error)}`);
  return `${prefix} with status ${response.status()}. Response body: ${body || "<empty>"}`;
}

async function expectAllValues(page: Page, values: RecordedValue[], phase: string) {
  for (const value of values) {
    await expect(achievementInput(page, value), `${phase}: ${targetName(value)}`).toHaveValue(String(value.testValue));
  }
}

async function restoreOriginalValues(sessions: ActorSession[], values: RecordedValue[], testInfo: TestInfo) {
  const restoreSession = sessions[0];
  if (!restoreSession || restoreSession.page.isClosed()) return;

  const restoreErrors: string[] = [];
  if (!restoreSession.page.url().includes(matchPath)) {
    try {
      await openMatchFromCaptainSection(restoreSession);
    } catch (error) {
      restoreErrors.push(`restore session reopen failed: ${errorMessage(error)}`);
    }
  }

  for (const value of values) {
    const ownerSession = sessions.find((session) => session.key === value.tester && !session.page.isClosed()) ?? restoreSession;
    try {
      if ((await readAchievementValue(ownerSession.page, value)) !== value.originalValue) {
        await setAchievementAndWaitForCommit(ownerSession.page, value, value.originalValue);
      }
    } catch (error) {
      restoreErrors.push(`${targetName(value)}: ${errorMessage(error)}`);
    }
  }

  try {
    await Promise.all(sessions.map((session) => session.page.isClosed() ? null : session.page.reload({ waitUntil: "networkidle" })));
  } catch (error) {
    restoreErrors.push(`reload after restore failed: ${errorMessage(error)}`);
  }

  const unrestoredValues = await changedValuesAfterRestoreFailure(sessions, values);
  const unrestoredValuesText = formatChangedValues(unrestoredValues);
  if (restoreErrors.length > 0 || unrestoredValues.length > 0) {
    await testInfo.attach("restore-error.txt", {
      body: [
        "Restore attempts that failed:",
        restoreErrors.length > 0 ? restoreErrors.join("\n") : "none",
        "",
        "Values not restored after all restore attempts:",
        unrestoredValuesText,
      ].join("\n"),
      contentType: "text/plain",
    });
    throw new Error(
      [
        "Failed to restore original match-sheet values.",
        "Restore attempts that failed:",
        restoreErrors.length > 0 ? restoreErrors.join("\n") : "none",
        "",
        "Values not restored:",
        unrestoredValuesText,
      ].join("\n"),
    );
  }
}

async function restoreOriginalLineups(
  sessions: ActorSession[],
  records: RecordedPlayerLineup[],
  testInfo: TestInfo,
) {
  try {
    for (const record of records) {
      const ownerSession = sessions.find((session) => session.key === record.tester && !session.page.isClosed());
      if (!ownerSession) continue;

      if ((await playerSelect(ownerSession.page, record).inputValue()) !== record.originalValue) {
        await setPlayerAndWaitForAutosave(ownerSession.page, record, record.originalValue);
      }
    }

    await Promise.all(sessions.map((session) => session.page.isClosed() ? null : session.page.reload({ waitUntil: "networkidle" })));
    for (const record of records) {
      const ownerSession = sessions.find((session) => session.key === record.tester && !session.page.isClosed());
      if (!ownerSession) continue;
      await expect(playerSelect(ownerSession.page, record), `restore lineup: ${lineupTargetName(record)}`).toHaveValue(record.originalValue);
    }
  } catch (error) {
    await testInfo.attach("lineup-restore-error.txt", {
      body: error instanceof Error ? error.stack ?? error.message : String(error),
      contentType: "text/plain",
    });
    throw error;
  }
}

async function changedValuesAfterRestoreFailure(sessions: ActorSession[], values: RecordedValue[]) {
  const readableSession = sessions.find((session) => !session.page.isClosed());
  if (!readableSession) return [];

  const changedValues: Array<RecordedValue & { currentValue: number | null }> = [];
  for (const value of values) {
    try {
      const currentValue = await readAchievementValue(readableSession.page, value);
      if (currentValue !== value.originalValue) {
        changedValues.push({ ...value, currentValue });
      }
    } catch {
      changedValues.push({ ...value, currentValue: null });
    }
  }
  return changedValues;
}

function formatChangedValues(changedValues: Array<RecordedValue & { currentValue: number | null }>) {
  return changedValues.length > 0
    ? changedValues.map((value) => {
        const currentValue = value.currentValue === null ? "unreadable after restore attempts" : value.currentValue;
        return `${targetName(value)}: expected original ${value.originalValue}, current ${currentValue}`;
      }).join("\n")
    : "none";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

async function attachFailureDiagnostics(
  sessions: ActorSession[],
  testInfo: TestInfo,
  error: unknown,
) {
  await testInfo.attach("diagnostic.txt", {
    body: error instanceof Error ? error.stack ?? error.message : String(error),
    contentType: "text/plain",
  });

  await Promise.all(
    sessions.map(async (session) => {
      if (session.page.isClosed()) return;
      await testInfo.attach(`${session.key}-url.txt`, {
        body: session.page.url(),
        contentType: "text/plain",
      });
      await session.page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`${session.key}-failure.png`),
      });
    }),
  );
}

async function closeSessions(sessions: ActorSession[]) {
  await Promise.all(
    sessions.map((session) => session.context.close()),
  );
}

async function assertSingle(locator: Locator, description: string) {
  const count = await locator.count();
  if (count !== 1) {
    throw new SafeAbortError(`Expected exactly one ${description}, found ${count}. Aborting before ambiguous edits.`, {
      step: "unique locator safety check",
      tester: description.split(" ")[0] || "unknown tester",
    });
  }
}

function nextTestValue(value: number) {
  return value + 1;
}

function sameTarget(first: AchievementTarget, second: AchievementTarget) {
  return first.orderNumber === second.orderNumber && first.side === second.side && first.type === second.type;
}

function targetName(target: AchievementTarget) {
  return `row ${target.orderNumber}, ${target.side}, ${achievementLabels[target.type]}`;
}

function lineupTargetName(target: PlayerLineupTarget) {
  return `row ${target.orderNumber}, ${target.side} lineup`;
}
