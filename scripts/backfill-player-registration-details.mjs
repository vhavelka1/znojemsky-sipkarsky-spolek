import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const applyChanges = process.argv.includes("--apply");
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
    .trim();
}

function fullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function updateFromCandidate(player, candidate) {
  const update = {};
  if (!hasValue(player.first_name) && hasValue(candidate.firstName)) update.first_name = candidate.firstName;
  if (!hasValue(player.last_name) && hasValue(candidate.lastName)) update.last_name = candidate.lastName;
  if (!hasValue(player.email) && hasValue(candidate.email)) update.email = candidate.email;
  if (!hasValue(player.phone) && hasValue(candidate.phone)) update.phone = candidate.phone;
  if (!hasValue(player.residence) && hasValue(candidate.residence)) update.residence = candidate.residence;
  if (!hasValue(player.date_of_birth) && hasValue(candidate.dateOfBirth)) update.date_of_birth = candidate.dateOfBirth;
  return update;
}

const { data: players, error: playersError } = await supabase
  .from("players")
  .select("id, display_name, first_name, last_name, email, phone, residence, date_of_birth")
  .is("deleted_at", null);

if (playersError) throw new Error(playersError.message);

const playerById = new Map((players ?? []).map((player) => [player.id, player]));
const playerByEmail = new Map(
  (players ?? [])
    .filter((player) => hasValue(player.email))
    .map((player) => [normalize(player.email), player]),
);
const playerByName = new Map();
for (const player of players ?? []) {
  const names = [
    normalize(player.display_name),
    normalize(fullName(player.first_name, player.last_name)),
  ].filter(Boolean);
  for (const name of names) {
    if (!playerByName.has(name)) playerByName.set(name, player);
  }
}

const candidates = [];
const { data: teamRequests, error: teamRequestsError } = await supabase
  .from("team_registration_requests")
  .select("id, captain_name, captain_email, captain_phone, captain_address, captain_date_of_birth, assistant_captain_name, assistant_captain_email, assistant_captain_phone, assistant_captain_address, assistant_captain_date_of_birth")
  .eq("status", "approved")
  .is("deleted_at", null);

if (teamRequestsError) throw new Error(teamRequestsError.message);

for (const request of teamRequests ?? []) {
  const captainParts = request.captain_name.trim().split(/\s+/);
  candidates.push({
    source: "team_captain",
    sourceId: request.id,
    firstName: captainParts[0] ?? "",
    lastName: captainParts.slice(1).join(" "),
    email: request.captain_email,
    phone: request.captain_phone,
    residence: request.captain_address,
    dateOfBirth: request.captain_date_of_birth,
  });

  if (hasValue(request.assistant_captain_name)) {
    const assistantParts = request.assistant_captain_name.trim().split(/\s+/);
    candidates.push({
      source: "team_assistant_captain",
      sourceId: request.id,
      firstName: assistantParts[0] ?? "",
      lastName: assistantParts.slice(1).join(" "),
      email: request.assistant_captain_email,
      phone: request.assistant_captain_phone,
      residence: request.assistant_captain_address,
      dateOfBirth: request.assistant_captain_date_of_birth,
    });
  }
}

const teamRequestIds = (teamRequests ?? []).map((request) => request.id);
for (const requestIds of chunks(teamRequestIds, 200)) {
  if (requestIds.length === 0) continue;
  const { data: rosterRows, error: rosterError } = await supabase
    .from("team_registration_players")
    .select("id, first_name, last_name, email, phone, address, date_of_birth, matched_player_id")
    .in("request_id", requestIds);

  if (rosterError) throw new Error(rosterError.message);

  for (const row of rosterRows ?? []) {
    candidates.push({
      source: "team_roster",
      sourceId: row.id,
      matchedPlayerId: row.matched_player_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      residence: row.address,
      dateOfBirth: row.date_of_birth,
    });
  }
}

const { data: playerRequests, error: playerRequestsError } = await supabase
  .from("player_registration_requests")
  .select("id, first_name, last_name, email, phone, residence, date_of_birth, matched_player_id")
  .eq("status", "approved")
  .is("deleted_at", null);

if (playerRequestsError) throw new Error(playerRequestsError.message);

for (const request of playerRequests ?? []) {
  candidates.push({
    source: "player_registration",
    sourceId: request.id,
    matchedPlayerId: request.matched_player_id,
    firstName: request.first_name,
    lastName: request.last_name,
    email: request.email,
    phone: request.phone,
    residence: request.residence,
    dateOfBirth: request.date_of_birth,
  });
}

const updatesByPlayerId = new Map();
const skipped = [];
for (const candidate of candidates) {
  const player =
    (candidate.matchedPlayerId ? playerById.get(candidate.matchedPlayerId) : null) ??
    (hasValue(candidate.email) ? playerByEmail.get(normalize(candidate.email)) : null) ??
    playerByName.get(normalize(fullName(candidate.firstName, candidate.lastName)));

  if (!player) {
    skipped.push({ source: candidate.source, sourceId: candidate.sourceId, reason: "player_not_found" });
    continue;
  }

  const currentUpdate = updatesByPlayerId.get(player.id)?.update ?? {};
  const mergedPlayer = { ...player, ...currentUpdate };
  const update = { ...currentUpdate, ...updateFromCandidate(mergedPlayer, candidate) };

  if (Object.keys(update).length > Object.keys(currentUpdate).length) {
    updatesByPlayerId.set(player.id, {
      playerName: player.display_name,
      update,
      sources: [...(updatesByPlayerId.get(player.id)?.sources ?? []), `${candidate.source}:${candidate.sourceId}`],
    });
  }
}

const updates = [...updatesByPlayerId.entries()].map(([playerId, detail]) => ({
  playerId,
  ...detail,
}));

if (applyChanges) {
  for (const update of updates) {
    const { error } = await supabase
      .from("players")
      .update(update.update)
      .eq("id", update.playerId)
      .is("deleted_at", null);

    if (error) throw new Error(`Failed to update ${update.playerName}: ${error.message}`);
  }
}

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry-run",
  candidates: candidates.length,
  playersToUpdate: updates.length,
  skipped: skipped.length,
  updates: updates.map((update) => ({
    playerName: update.playerName,
    fields: Object.keys(update.update),
  })),
}, null, 2));
