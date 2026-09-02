import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

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

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split(";");
  return lines.map((line) => {
    const values = line.split(";");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCzechDate(dateText) {
  const match = dateText.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) throw new Error(`Invalid date: ${dateText}`);
  return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
}

function pragueMatchIso(dateText) {
  const { day, month, year } = parseCzechDate(dateText);
  const ymd = year * 10000 + month * 100 + day;
  const offsetHours = ymd <= 20261024 || ymd >= 20270328 ? 2 : 1;
  return new Date(Date.UTC(year, month - 1, day, 19 - offsetHours, 0, 0)).toISOString();
}

function pragueMatchTime(dateText) {
  return new Date(pragueMatchIso(dateText)).getTime();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " a ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasCanonical = new Map([
  ["srsni vemyslice", "dc srsni vemyslice"],
  ["dc krakeni hrusovany n j", "dc krakeni hrusovany nad jevisovkou"],
  ["loofci", "loofci moravske budejovice"],
  ["dc orli drnholec", "dc orli"],
  ["oktopus kridluvky", "octopus kridluvky"],
]);

function canonicalName(name) {
  const normalized = normalize(name);
  return aliasCanonical.get(normalized) ?? normalized;
}

const seasonId = "3d27962f-1ec4-487a-8c2e-c4bd15efa6d0";
const leagueId = "9af073f3-5c20-4f93-9c50-f0314db3af81";
const rows = parseCsv(fs.readFileSync(path.resolve("import/zapasy_2026_2027_import.csv"), "utf8"));

const [{ data: matches, error: matchesError }, { data: teamSeasons, error: teamSeasonsError }, { data: teams, error: teamsError }] =
  await Promise.all([
    supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, scheduled_at, round_number")
      .eq("season_id", seasonId)
      .eq("league_id", leagueId)
      .is("deleted_at", null),
    supabase
      .from("team_seasons")
      .select("id, team_id, display_name")
      .eq("season_id", seasonId)
      .is("deleted_at", null),
    supabase.from("teams").select("id, name").is("deleted_at", null),
  ]);

if (matchesError || teamSeasonsError || teamsError) {
  throw new Error(matchesError?.message ?? teamSeasonsError?.message ?? teamsError.message);
}

const teamById = new Map((teams ?? []).map((team) => [team.id, team]));
const nameByTeamSeasonId = new Map(
  (teamSeasons ?? []).map((teamSeason) => [
    teamSeason.id,
    canonicalName(teamSeason.display_name || teamById.get(teamSeason.team_id)?.name),
  ]),
);
const matchByKey = new Map(
  (matches ?? []).map((match) => [
    [
      new Date(match.scheduled_at).getTime(),
      nameByTeamSeasonId.get(match.home_team_id),
      nameByTeamSeasonId.get(match.away_team_id),
    ].join("|"),
    match,
  ]),
);

const updates = rows.map((row) => {
  const key = [
    pragueMatchTime(row.date),
    canonicalName(row.home_team),
    canonicalName(row.away_team),
  ].join("|");
  const match = matchByKey.get(key);
  if (!match) throw new Error(`Match not found for ${row.group} ${row.round}: ${row.home_team} - ${row.away_team}`);
  return { id: match.id, round_number: Number(row.round) };
});

for (const update of updates) {
  const { error } = await supabase
    .from("matches")
    .update({ round_number: update.round_number })
    .eq("id", update.id);
  if (error) throw new Error(`Failed to update match ${update.id}: ${error.message}`);
}

const { data: verification, error: verificationError } = await supabase
  .from("matches")
  .select("round_number")
  .eq("season_id", seasonId)
  .eq("league_id", leagueId)
  .is("deleted_at", null);

if (verificationError) throw new Error(verificationError.message);

const roundCounts = new Map();
for (const match of verification ?? []) {
  roundCounts.set(match.round_number, (roundCounts.get(match.round_number) ?? 0) + 1);
}

const badRounds = [...roundCounts.entries()].filter(([round, count]) => round < 1 || round > 22 || count !== 10);
if (roundCounts.size !== 22 || badRounds.length > 0) {
  throw new Error(`Round verification failed: ${JSON.stringify(Object.fromEntries(roundCounts))}`);
}

console.log(JSON.stringify({ updated: updates.length, rounds: Object.fromEntries(roundCounts) }, null, 2));
