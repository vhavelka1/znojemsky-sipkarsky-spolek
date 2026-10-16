# Match Sheet Concurrent Autosave E2E

This Playwright test verifies the captain match-sheet lifecycle with three signed-in captain sessions:

- staged home and away lineup assignment
- hidden opponent lineups before reveal
- lineup reveal for both first-block sides
- concurrent per-field achievement saves (Enter, equivalent to leaving the edited field)
- reload verification from all three sessions

## Safe default

The production command is allowlisted to one match only:

```text
d18533e4-63bf-412d-9bb8-79bf54703005
```

It refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` points at the known production Supabase host and the runner receives the exact match ID confirmation embedded in the npm script. The test does not reset or restore edited data in production; reset the match from the application before or after manual test runs.

With production Supabase values in `.env.local` and the three captain credentials exported in the shell, run:

```powershell
$env:ZSS_E2E_BASE_URL = "http://127.0.0.1:3000"
$env:ZSS_E2E_KOHOUTI_1_EMAIL = "..."
$env:ZSS_E2E_KOHOUTI_1_PASSWORD = "..."
$env:ZSS_E2E_KOHOUTI_2_EMAIL = "..."
$env:ZSS_E2E_KOHOUTI_2_PASSWORD = "..."
$env:ZSS_E2E_KOBRY_EMAIL = "..."
$env:ZSS_E2E_KOBRY_PASSWORD = "..."
npm run test:e2e:match-concurrent:production
```

The runner prints a final `PASS match-sheet E2E production d18533e4-63bf-412d-9bb8-79bf54703005` or `FAIL match-sheet E2E production d18533e4-63bf-412d-9bb8-79bf54703005` line.

## Staging Fixture

The staging command remains available for an isolated match fixture:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://YOUR-STAGING-PROJECT.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "..."
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
$env:ZSS_E2E_BASE_URL = "http://127.0.0.1:3000"
$env:ZSS_E2E_DATABASE_CONFIRMATION = "staging"
$env:ZSS_E2E_USE_ISOLATED_MATCH = "true"
$env:ZSS_E2E_KOHOUTI_1_EMAIL = "..."
$env:ZSS_E2E_KOHOUTI_1_PASSWORD = "..."
$env:ZSS_E2E_KOHOUTI_2_EMAIL = "..."
$env:ZSS_E2E_KOHOUTI_2_PASSWORD = "..."
$env:ZSS_E2E_KOBRY_EMAIL = "..."
$env:ZSS_E2E_KOBRY_PASSWORD = "..."
npm run test:e2e:match-concurrent:staging
```

The fixture derives the home team from `ZSS_E2E_KOHOUTI_1_EMAIL` and `ZSS_E2E_KOHOUTI_2_EMAIL`, derives the away team from `ZSS_E2E_KOBRY_EMAIL`, creates one temporary match plus 19 match-game rows, and soft-deletes all created or changed match-sheet rows in cleanup.

The runner refuses to start unless `ZSS_E2E_DATABASE_CONFIRMATION=staging` and `ZSS_E2E_USE_ISOLATED_MATCH=true` are set. The fixture also refuses the known production Supabase host.

Failure artifacts are written under `test-results/`; the HTML report is written under `playwright-report/`. The test attaches fixture details and cleanup verification JSON to the report.
