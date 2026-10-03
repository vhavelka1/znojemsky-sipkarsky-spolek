import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

function createState() {
  return {
    match: { id: "match-1", status: "awaiting_confirmation" },
    games: [{ id: "game-1", order_number: 1, home_legs: 2, away_legs: 1, updated_at: "v1" }],
    players: [
      { id: "row-home", game_id: "game-1", side: "home", position: 1, player_id: "A", deleted_at: null },
      { id: "row-away", game_id: "game-1", side: "away", position: 1, player_id: "B", deleted_at: null },
    ],
    achievements: [
      { id: "ach-away", game_id: "game-1", player_id: "B", type: "score_95_plus", count: 4, deleted_at: null },
    ],
    audit: [],
  };
}

function actorContext(requestId = randomUUID()) {
  return {
    actor_user_id: "user-1",
    actor_player_id: "captain-1",
    actor_role: "captain",
    source: "captain_sheet",
    request_id: requestId,
  };
}

function assertUnlocked(state) {
  if (state.match.status === "confirmed") {
    throw new Error("confirmed match is locked");
  }
}

function audit(state, fieldName, oldValue, newValue, context) {
  state.audit.push({
    field_name: fieldName,
    old_value: oldValue,
    new_value: newValue,
    ...context,
  });
}

function updateLegs(state, patch, context = actorContext()) {
  assertUnlocked(state);
  const game = state.games.find((item) => item.order_number === patch.order_number);
  if (patch.expected_updated_at && patch.expected_updated_at !== game.updated_at) {
    throw new Error("stale autosave rejected");
  }
  const oldHome = game.home_legs;
  const oldAway = game.away_legs;
  if ("home_legs" in patch) game.home_legs = patch.home_legs;
  if ("away_legs" in patch) game.away_legs = patch.away_legs;
  game.updated_at = randomUUID();
  if (oldHome !== game.home_legs) audit(state, "home_legs", oldHome, game.home_legs, context);
  if (oldAway !== game.away_legs) audit(state, "away_legs", oldAway, game.away_legs, context);
}

function updateAchievement(state, patch, context = actorContext()) {
  assertUnlocked(state);
  const achievement = state.achievements.find(
    (item) => item.game_id === patch.game_id && item.player_id === patch.player_id && item.type === patch.type && !item.deleted_at,
  );
  const oldValue = achievement?.count ?? 0;
  if (achievement) achievement.count = patch.count;
  else state.achievements.push({ id: randomUUID(), game_id: patch.game_id, player_id: patch.player_id, type: patch.type, count: patch.count, deleted_at: null });
  audit(state, `achievement:${patch.type}`, oldValue, patch.count, context);
}

function updatePlayer(state, patch, context = actorContext()) {
  assertUnlocked(state);
  if (!("player_id" in patch)) return;
  const row = state.players.find(
    (item) => item.game_id === patch.game_id && item.side === patch.side && item.position === patch.position && !item.deleted_at,
  );
  if (patch.player_id === null) {
    if (row) {
      row.deleted_at = new Date().toISOString();
      audit(state, `player:${patch.side}:${patch.position}`, row.player_id, null, context);
    }
    return;
  }
  if (row) {
    const oldPlayer = row.player_id;
    row.player_id = patch.player_id;
    audit(state, `player:${patch.side}:${patch.position}`, oldPlayer, patch.player_id, context);
  } else {
    state.players.push({ id: randomUUID(), game_id: patch.game_id, side: patch.side, position: patch.position, player_id: patch.player_id, deleted_at: null });
    audit(state, `player:${patch.side}:${patch.position}`, null, patch.player_id, context);
  }
}

test("legs update does not mutate or soft-delete player rows", () => {
  const state = createState();
  updateLegs(state, { order_number: 1, home_legs: 3 });
  assert.equal(state.games[0].home_legs, 3);
  assert.equal(state.players.find((row) => row.side === "home").player_id, "A");
  assert.equal(state.players.find((row) => row.side === "away").player_id, "B");
  assert.equal(state.players.filter((row) => row.deleted_at).length, 0);
});

test("concurrent legs and achievement deltas both survive", () => {
  const state = createState();
  updateLegs(state, { order_number: 1, home_legs: 3 });
  updateAchievement(state, { game_id: "game-1", player_id: "B", type: "score_95_plus", count: 5 });
  assert.equal(state.games[0].home_legs, 3);
  assert.equal(state.achievements.find((item) => item.id === "ach-away").count, 5);
});

test("absent player fields are ignored", () => {
  const state = createState();
  updatePlayer(state, { game_id: "game-1", side: "home", position: 1 });
  assert.equal(state.players.find((row) => row.side === "home").player_id, "A");
  assert.equal(state.players.filter((row) => row.deleted_at).length, 0);
});

test("explicit player null soft-deletes only the targeted slot", () => {
  const state = createState();
  updatePlayer(state, { game_id: "game-1", side: "home", position: 1, player_id: null });
  assert.equal(state.players.find((row) => row.side === "home").deleted_at !== null, true);
  assert.equal(state.players.find((row) => row.side === "away").deleted_at, null);
});

test("player replacement leaves other slots untouched", () => {
  const state = createState();
  updatePlayer(state, { game_id: "game-1", side: "home", position: 1, player_id: "C" });
  assert.equal(state.players.find((row) => row.side === "home").player_id, "C");
  assert.equal(state.players.find((row) => row.side === "away").player_id, "B");
});

test("audit contains old/new actor source and request_id", () => {
  const state = createState();
  const context = actorContext("request-1");
  updateLegs(state, { order_number: 1, home_legs: 3 }, context);
  assert.deepEqual(state.audit[0], {
    field_name: "home_legs",
    old_value: 2,
    new_value: 3,
    actor_user_id: "user-1",
    actor_player_id: "captain-1",
    actor_role: "captain",
    source: "captain_sheet",
    request_id: "request-1",
  });
});

test("two field updates from one request share request_id", () => {
  const state = createState();
  const context = actorContext("request-2");
  updateLegs(state, { order_number: 1, home_legs: 3, away_legs: 2 }, context);
  assert.equal(state.audit.length, 2);
  assert.equal(new Set(state.audit.map((entry) => entry.request_id)).size, 1);
});

test("confirmed match rejects autosave", () => {
  const state = createState();
  state.match.status = "confirmed";
  assert.throws(() => updateLegs(state, { order_number: 1, home_legs: 3 }), /locked/);
});

test("stale legs request cannot roll back a newer change", () => {
  const state = createState();
  updateLegs(state, { order_number: 1, home_legs: 3, expected_updated_at: "v1" });
  const newerUpdatedAt = state.games[0].updated_at;
  assert.throws(
    () => updateLegs(state, { order_number: 1, home_legs: 2, expected_updated_at: "v1" }),
    /stale/,
  );
  assert.equal(state.games[0].home_legs, 3);
  assert.equal(state.games[0].updated_at, newerUpdatedAt);
});
