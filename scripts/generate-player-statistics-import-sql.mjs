import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  },
});

function sqlString(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const check = JSON.parse(await fs.readFile(path.resolve("tmp/player-statistics-import-check.json"), "utf8"));
if (check.totals.matched !== check.totals.rows || check.totals.missingPlayers || check.totals.missingTeams || check.totals.duplicateRows) {
  throw new Error(`Import is not consistent: ${JSON.stringify(check.totals)}`);
}

const [{ data: seasons }, { data: leagues }, { data: groups }, { data: teamSeasons }] = await Promise.all([
  supabase.from("seasons").select("id, name").eq("name", "Liga 2025/2026").is("deleted_at", null),
  supabase.from("leagues").select("id, name").is("deleted_at", null),
  supabase.from("league_groups").select("id, name, league_id").is("deleted_at", null),
  supabase.from("team_seasons").select("id, team_id, season_id").is("deleted_at", null),
]);

const season = seasons?.[0];
if (!season) throw new Error("Season Liga 2025/2026 not found.");

const leagueByGroupCode = new Map([
  ["A", leagues?.find((league) => normalize(league.name).endsWith("2025 2026 a"))],
  ["B", leagues?.find((league) => normalize(league.name).endsWith("2025 2026 b"))],
]);

const groupByGroupCode = new Map([
  ["A", groups?.find((group) => normalize(group.name) === "skupina a")],
  ["B", groups?.find((group) => normalize(group.name) === "skupina b")],
]);

for (const code of ["A", "B"]) {
  if (!leagueByGroupCode.get(code)) throw new Error(`League ${code} not found.`);
  if (!groupByGroupCode.get(code)) throw new Error(`Group ${code} not found.`);
}

const teamSeasonByTeamId = new Map(teamSeasons?.map((teamSeason) => [`${teamSeason.team_id}:${teamSeason.season_id}`, teamSeason]) ?? []);
const values = [];
const missingTeamSeasons = [];

for (const row of check.matched) {
  const teamSeason = teamSeasonByTeamId.get(`${row.team_id}:${season.id}`);
  if (!teamSeason) {
    missingTeamSeasons.push(row);
    continue;
  }

  const league = leagueByGroupCode.get(row.group);
  const group = groupByGroupCode.get(row.group);
  values.push(`(
    ${sqlString(season.id)}::uuid,
    ${sqlString(league.id)}::uuid,
    ${sqlString(group.id)}::uuid,
    ${sqlString(row.team_id)}::uuid,
    ${sqlString(teamSeason.id)}::uuid,
    ${sqlString(row.player_id)}::uuid,
    ${row.played_matches},
    ${row.won_matches},
    ${row.lost_matches},
    ${row.played_legs},
    ${row.won_legs},
    ${row.lost_legs},
    ${row.score_95_plus},
    ${row.score_133_plus},
    ${row.score_171_plus},
    ${row.checkout_100_plus},
    ${sqlString(`${row.source_file} / List1`)}
  )`);
}

if (missingTeamSeasons.length > 0) {
  throw new Error(`Missing team seasons: ${JSON.stringify(missingTeamSeasons.slice(0, 10))}`);
}

const migrationSql = await fs.readFile(path.resolve("supabase/migrations/20260622002000_player_season_statistics.sql"), "utf8");
const output = `${migrationSql}

update public.teams
set deleted_at = null
where slug = 'aligatori-kucharovice'
  and deleted_at is not null;

with imported_statistics (
  season_id,
  league_id,
  group_id,
  team_id,
  team_season_id,
  player_id,
  played_matches,
  won_matches,
  lost_matches,
  played_legs,
  won_legs,
  lost_legs,
  score_95_plus,
  score_133_plus,
  score_171_plus,
  checkout_100_plus,
  source_label
) as (
  values
${values.join(",\n")}
)
insert into public.player_season_statistics (
  season_id,
  league_id,
  group_id,
  team_id,
  team_season_id,
  player_id,
  played_matches,
  won_matches,
  lost_matches,
  played_legs,
  won_legs,
  lost_legs,
  score_95_plus,
  score_133_plus,
  score_171_plus,
  checkout_100_plus,
  source_label,
  imported_at,
  deleted_at
)
select
  season_id,
  league_id,
  group_id,
  team_id,
  team_season_id,
  player_id,
  played_matches,
  won_matches,
  lost_matches,
  played_legs,
  won_legs,
  lost_legs,
  score_95_plus,
  score_133_plus,
  score_171_plus,
  checkout_100_plus,
  source_label,
  now(),
  null
from imported_statistics
on conflict (season_id, league_id, group_id, player_id) where deleted_at is null
do update set
  team_id = excluded.team_id,
  team_season_id = excluded.team_season_id,
  played_matches = excluded.played_matches,
  won_matches = excluded.won_matches,
  lost_matches = excluded.lost_matches,
  played_legs = excluded.played_legs,
  won_legs = excluded.won_legs,
  lost_legs = excluded.lost_legs,
  score_95_plus = excluded.score_95_plus,
  score_133_plus = excluded.score_133_plus,
  score_171_plus = excluded.score_171_plus,
  checkout_100_plus = excluded.checkout_100_plus,
  source_label = excluded.source_label,
  imported_at = now(),
  deleted_at = null,
  updated_at = now();
`;

await fs.writeFile(path.resolve("supabase/apply_player_season_statistics_2025_2026_in_dashboard.sql"), output, "utf8");
console.log(JSON.stringify({ rows: values.length, output: "supabase/apply_player_season_statistics_2025_2026_in_dashboard.sql" }, null, 2));
