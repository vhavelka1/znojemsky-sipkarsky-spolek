import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const productionMatchId = "d18533e4-63bf-412d-9bb8-79bf54703005";
const playwrightCliPath = resolve("node_modules", "playwright", "cli.js");
const reportPath = resolve("playwright-report", "index.html");
const resultsPath = resolve("test-results");
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const productionMatchConfirmation = rawArgs
  .find((arg) => arg.startsWith("--production-match="))
  ?.slice("--production-match=".length);
const mode = args.has("--production") ? "production" : "staging";
const dotEnvLocal = readDotEnvLocal();
const env = {
  ...dotEnvLocal,
  ...process.env,
};

const required = [
  "ZSS_E2E_BASE_URL",
  "ZSS_E2E_KOHOUTI_1_EMAIL",
  "ZSS_E2E_KOHOUTI_1_PASSWORD",
  "ZSS_E2E_KOHOUTI_2_EMAIL",
  "ZSS_E2E_KOHOUTI_2_PASSWORD",
  "ZSS_E2E_KOBRY_EMAIL",
  "ZSS_E2E_KOBRY_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const productionSupabaseHost = "edcilogoqicbygtywbzq.supabase.co";
const forbiddenStagingSupabaseHosts = new Set([
  "edcilogoqicbygtywbzq.supabase.co",
  ...(env.ZSS_E2E_FORBID_SUPABASE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
]);

if (mode === "staging") {
  required.push("ZSS_E2E_DATABASE_CONFIRMATION", "ZSS_E2E_USE_ISOLATED_MATCH");
}

const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  failBeforePlaywright(`Missing required environment variables: ${missing.join(", ")}`);
}

let supabaseHost;
try {
  supabaseHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
} catch {
  failBeforePlaywright("Refusing to run match-sheet E2E because NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
}

if (mode === "staging") {
  if (env.ZSS_E2E_DATABASE_CONFIRMATION !== "staging") {
    failBeforePlaywright("Refusing to run match-sheet E2E unless ZSS_E2E_DATABASE_CONFIRMATION=staging.");
  }

  if (env.ZSS_E2E_USE_ISOLATED_MATCH !== "true") {
    failBeforePlaywright("Refusing to run match-sheet E2E unless ZSS_E2E_USE_ISOLATED_MATCH=true.");
  }

  if (forbiddenStagingSupabaseHosts.has(supabaseHost)) {
    failBeforePlaywright(`Refusing to run staging match-sheet E2E against forbidden Supabase host ${supabaseHost}.`);
  }
}

if (mode === "production") {
  const confirmedMatchId = productionMatchConfirmation ?? env.ZSS_E2E_PRODUCTION_MATCH_ID_CONFIRMATION;
  if (confirmedMatchId !== productionMatchId) {
    failBeforePlaywright(
      `Refusing production match-sheet E2E unless --production-match=${productionMatchId} or ZSS_E2E_PRODUCTION_MATCH_ID_CONFIRMATION=${productionMatchId} is provided.`,
    );
  }

  if (supabaseHost !== productionSupabaseHost) {
    failBeforePlaywright(
      `Refusing production match-sheet E2E unless NEXT_PUBLIC_SUPABASE_URL points at ${productionSupabaseHost}. Detected ${supabaseHost}.`,
    );
  }
}

if (!existsSync(playwrightCliPath)) {
  failBeforePlaywright(`Missing local Playwright CLI at ${playwrightCliPath}. Run npm install first.`);
}

const startedAt = Date.now();
const result = spawnSync(
  process.execPath,
  [playwrightCliPath, "test", "e2e/match-sheet-concurrent.spec.ts"],
  {
    env: {
      ...env,
      ZSS_E2E_ALLOW_MATCH_MUTATION: "true",
      ZSS_E2E_DATABASE_CONFIRMATION: mode,
      ZSS_E2E_USE_ISOLATED_MATCH: mode === "staging" ? "true" : "false",
      ZSS_E2E_SKIP_RESTORE: mode === "production" ? "true" : env.ZSS_E2E_SKIP_RESTORE,
      ZSS_E2E_ALLOW_IRREVERSIBLE_LINEUP_REVEAL: mode === "production" ? "true" : env.ZSS_E2E_ALLOW_IRREVERSIBLE_LINEUP_REVEAL,
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) {
  console.log(`PASS match-sheet E2E ${mode} ${mode === "production" ? productionMatchId : "isolated fixture"}`);
} else {
  const summary = failureSummary(`${result.stdout ?? ""}\n${result.stderr ?? ""}`, startedAt);
  console.error(`FAIL match-sheet E2E ${mode} ${mode === "production" ? productionMatchId : "isolated fixture"}`);
  console.error(`Reason: ${summary}`);
  console.error(`Report: ${reportPath}`);
  console.error(`Results: ${resultsPath}`);
}

process.exit(result.status ?? 1);

function readDotEnvLocal() {
  if (!existsSync(".env.local")) return {};

  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function failBeforePlaywright(reason) {
  console.error(`FAIL match-sheet E2E ${mode} ${mode === "production" ? productionMatchId : "isolated fixture"}`);
  console.error(`Reason: ${reason}`);
  console.error(`Report: ${reportPath} (not updated; Playwright did not start)`);
  console.error(`Results: ${resultsPath} (not updated; Playwright did not start)`);
  process.exit(1);
}

function failureSummary(output, startedAt) {
  const freshContext = latestFreshErrorContext(resultsPath, startedAt);
  if (freshContext) {
    return summarizeErrorContext(freshContext);
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const interesting = lines.filter((line) =>
    /Error:|Timeout|failed|FAIL|Expected|Refusing|Missing|Autosave|Login|lineup|reveal|achievement/i.test(line),
  );
  if (interesting.length > 0) {
    return interesting.slice(-8).join(" | ");
  }

  if (result.error) {
    return result.error.message;
  }

  return `Playwright exited with status ${result.status ?? "unknown"}.`;
}

function latestFreshErrorContext(directory, startedAt) {
  if (!existsSync(directory)) return null;

  const candidates = walkFiles(directory)
    .filter((file) => file.endsWith("error-context.md"))
    .map((file) => {
      const stats = statFile(file);
      return stats ? { file, mtimeMs: stats.mtimeMs } : null;
    })
    .filter(Boolean)
    .filter((item) => item.mtimeMs >= startedAt - 5000)
    .sort((first, second) => second.mtimeMs - first.mtimeMs);

  if (candidates.length === 0) return null;
  return readFileSync(candidates[0].file, "utf8");
}

function summarizeErrorContext(markdown) {
  const errorBlock = markdown.match(/# Error details\s+```([\s\S]*?)```/);
  if (errorBlock?.[1]?.trim()) {
    return errorBlock[1].trim().replace(/\s+/g, " ");
  }

  const errorLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Error:|Timeout|Expected/i.test(line));
  return errorLine ?? "See Playwright error context for details.";
}

function walkFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function statFile(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}
