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
const teamSeasonByTeamId = new Map(teamSeasons?.map((teamSeason) => [`${teamSeason.team_id}:${teamSeason.season_id}`, teamSeason]) ?? []);

const { error: restoreTeamError } = await supabase
  .from("teams")
  .update({ deleted_at: null })
  .eq("slug", "aligatori-kucharovice");

if (restoreTeamError) throw restoreTeamError;

const rows = check.matched.map((row) => {
  const league = leagueByGroupCode.get(row.group);
  const group = groupByGroupCode.get(row.group);
  const teamSeason = teamSeasonByTeamId.get(`${row.team_id}:${season.id}`);
  if (!league || !group || !teamSeason) {
    throw new Error(`Missing scope for ${row.player} (${row.team})`);
  }

  return {
    season_id: season.id,
    league_id: league.id,
    group_id: group.id,
    team_id: row.team_id,
    team_season_id: teamSeason.id,
    player_id: row.player_id,
    played_matches: row.played_matches,
    won_matches: row.won_matches,
    lost_matches: row.lost_matches,
    played_legs: row.played_legs,
    won_legs: row.won_legs,
    lost_legs: row.lost_legs,
    score_95_plus: row.score_95_plus,
    score_133_plus: row.score_133_plus,
    score_171_plus: row.score_171_plus,
    checkout_100_plus: row.checkout_100_plus,
    source_label: `${row.source_file} / List1`,
    imported_at: new Date().toISOString(),
    deleted_at: null,
  };
});

const { error: deleteError } = await supabase
  .from("player_season_statistics")
  .delete()
  .eq("season_id", season.id);

if (deleteError) throw deleteError;

for (let index = 0; index < rows.length; index += 100) {
  const chunk = rows.slice(index, index + 100);
  const { error } = await supabase.from("player_season_statistics").insert(chunk);
  if (error) throw error;
}

const { count, error: countError } = await supabase
  .from("player_season_statistics")
  .select("*", { count: "exact", head: true })
  .eq("season_id", season.id);

if (countError) throw countError;

console.log(JSON.stringify({ imported: rows.length, stored: count }, null, 2));
