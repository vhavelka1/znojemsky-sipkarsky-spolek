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
    .replace(/\bml\b\.?/g, "ml")
    .replace(/\bst\b\.?/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function teamAlias(value) {
  const normalized = normalize(value);
  const aliases = new Map([
    ["dc jezci mor krumlov", "dc jezci moravsky krumlov"],
    ["loofci moravske budejovice", "loofci moravske budejovice"],
    ["dc krakeni", "dc krakeni hrusovany nad jevisovkou"],
    ["dc krakeni hrusovany nad jeviso", "dc krakeni hrusovany nad jevisovkou"],
    ["oktopus kridluvky", "octopus kridluvky"],
    ["octopus kridluvky", "octopus kridluvky"],
  ]);
  return aliases.get(normalized) ?? normalized;
}

const parsedPath = path.resolve("tmp/player-statistics-parsed.json");
const parsed = JSON.parse(await fs.readFile(parsedPath, "utf8"));

const [{ data: players, error: playersError }, { data: teams, error: teamsError }, { data: seasons, error: seasonsError }] =
  await Promise.all([
    supabase.from("players").select("id, display_name, first_name, last_name").is("deleted_at", null),
    supabase.from("teams").select("id, name, slug, deleted_at"),
    supabase.from("seasons").select("id, name, is_active").is("deleted_at", null),
  ]);

if (playersError || teamsError || seasonsError) {
  throw new Error(playersError?.message ?? teamsError?.message ?? seasonsError?.message);
}

const playerByName = new Map(players.map((player) => [normalize(player.display_name), player]));
const teamByName = new Map(teams.map((team) => [teamAlias(team.name), team]));
const season = seasons.find((item) => normalize(item.name) === normalize("Liga 2025/2026"));

const missingPlayers = [];
const missingTeams = [];
const duplicateRows = [];
const seen = new Set();
const matched = [];

for (const row of parsed.rows) {
  const playerKey = normalize(row.player);
  const teamKey = teamAlias(row.team);
  const duplicateKey = `${row.group}:${playerKey}`;
  if (seen.has(duplicateKey)) duplicateRows.push(row);
  seen.add(duplicateKey);

  const player = playerByName.get(playerKey);
  const team = teamByName.get(teamKey);
  if (!player) missingPlayers.push(row);
  if (!team) missingTeams.push(row);
  if (player && team) matched.push({ ...row, player_id: player.id, team_id: team.id });
}

const result = {
  season,
  totals: {
    rows: parsed.rows.length,
    matched: matched.length,
    missingPlayers: missingPlayers.length,
    missingTeams: missingTeams.length,
    duplicateRows: duplicateRows.length,
  },
  missingPlayers: missingPlayers.slice(0, 100),
  missingTeams: missingTeams.slice(0, 100),
  duplicateRows,
  matched,
};

await fs.writeFile(path.resolve("tmp/player-statistics-import-check.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result.totals, null, 2));
if (!season) console.log("Missing season Liga 2025/2026");
