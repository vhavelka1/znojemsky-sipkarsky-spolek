import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type MatchGameType = "singles" | "doubles" | "cricket" | "tiebreak_701";
type MatchSide = "home" | "away";
type HomeSlotCode = "1" | "2" | "3" | "4";
type AwaySlotCode = "A" | "B" | "C" | "D";
type SlotCode = HomeSlotCode | AwaySlotCode;
type AchievementType =
  | "score_95_plus"
  | "score_133_plus"
  | "score_171_plus"
  | "checkout_100_plus";

type SubmittedGame = {
  game_type?: unknown;
  order_number?: unknown;
  home_legs?: unknown;
  away_legs?: unknown;
  winner_side?: unknown;
  home_player_ids?: unknown;
  away_player_ids?: unknown;
  home_slot_codes?: unknown;
  away_slot_codes?: unknown;
};

type SubmittedAchievement = {
  order_number?: unknown;
  player_id?: unknown;
  achievement_type?: unknown;
  achievement_count?: unknown;
};

type SaveSheetBody = {
  games?: unknown;
  achievements?: unknown;
  slots?: unknown;
};

type SubmittedSlot = {
  side?: unknown;
  slot_code?: unknown;
  player_id?: unknown;
};

type MatchRow = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  played_at: string | null;
  status: "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
};

type MembershipRow = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain";
};

type MatchGameRow = {
  id: string;
  match_id: string;
  game_type: MatchGameType;
  order_number: number;
  home_legs: number;
  away_legs: number;
  winner_side: MatchSide | null;
};

type MatchGamePlayerRow = {
  id: string;
  match_game_id: string;
  side: MatchSide;
  player_id: string;
  position: number;
  slot_code: SlotCode | null;
};

type MatchAchievementRow = {
  id: string;
  match_id: string;
  match_game_id: string;
  player_id: string;
  achievement_type: AchievementType;
  achievement_count: number;
};

type MatchPlayerSlotRow = {
  id: string;
  match_id: string;
  side: MatchSide;
  slot_code: SlotCode;
  player_id: string;
};

type MatchConfirmationRow = {
  id: string;
  match_id: string;
  side: MatchSide;
  captain_player_id: string;
  confirmed_at: string;
};

type PlayerStatistics = {
  player_id: string;
  played_matches: number;
  won_matches: number;
  lost_matches: number;
  played_legs: number;
  won_legs: number;
  lost_legs: number;
};

type MatchScore = {
  home_points: number;
  away_points: number;
  home_legs: number;
  away_legs: number;
};

const gameTypes: MatchGameType[] = ["singles", "doubles", "cricket", "tiebreak_701"];
const achievementTypes: AchievementType[] = [
  "score_95_plus",
  "score_133_plus",
  "score_171_plus",
  "checkout_100_plus",
];
const homeSlotCodes: HomeSlotCode[] = ["1", "2", "3", "4"];
const awaySlotCodes: AwaySlotCode[] = ["A", "B", "C", "D"];
const singlesSlotPairs = new Map<number, [HomeSlotCode, AwaySlotCode]>([
  [1, ["1", "A"]],
  [2, ["2", "B"]],
  [3, ["3", "C"]],
  [4, ["4", "D"]],
  [5, ["1", "B"]],
  [6, ["2", "C"]],
  [7, ["3", "D"]],
  [8, ["4", "A"]],
  [11, ["1", "C"]],
  [12, ["2", "D"]],
  [13, ["3", "A"]],
  [14, ["4", "B"]],
  [15, ["1", "D"]],
  [16, ["2", "A"]],
  [17, ["3", "B"]],
  [18, ["4", "C"]],
]);

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace zápisů není povolena." },
    { status: 403 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json(
    { error: "Pro tuto akci je potřeba role administrátora." },
    { status: 403 },
  );
}

function guardRequest() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  return mockAdminResponse();
}

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nepodařilo se načíst serverové nastavení.",
        },
        { status: 500 },
      ),
    };
  }
}

function parseString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function isSlotForSide(side: MatchSide, slotCode: string): slotCode is SlotCode {
  return side === "home"
    ? homeSlotCodes.includes(slotCode as HomeSlotCode)
    : awaySlotCodes.includes(slotCode as AwaySlotCode);
}

function slotKey(side: MatchSide, slotCode: SlotCode) {
  return `${side}:${slotCode}`;
}

function getDefaultGames() {
  return Array.from({ length: 19 }, (_, index) => {
    const orderNumber = index + 1;
    const gameType: MatchGameType =
      orderNumber <= 8 || (orderNumber >= 11 && orderNumber <= 18)
        ? "singles"
        : orderNumber === 9
          ? "doubles"
          : orderNumber === 10
            ? "cricket"
            : "tiebreak_701";

    return {
      id: null as string | null,
      match_id: null as string | null,
      game_type: gameType,
      order_number: orderNumber,
      home_legs: 0,
      away_legs: 0,
      winner_side: null as MatchSide | null,
      home_player_ids: [] as string[],
      away_player_ids: [] as string[],
      home_slot_codes: singlesSlotPairs.get(orderNumber)?.slice(0, 1) ?? [],
      away_slot_codes: singlesSlotPairs.get(orderNumber)?.slice(1, 2) ?? [],
    };
  });
}

function normalizeGameType(gameType: string): MatchGameType {
  if (gameType === "single") {
    return "singles";
  }

  if (gameType === "tiebreak") {
    return "tiebreak_701";
  }

  return gameTypes.includes(gameType as MatchGameType)
    ? (gameType as MatchGameType)
    : "singles";
}

function calculateWinner(gameType: MatchGameType, homeLegs: number, awayLegs: number) {
  const winningLegs = gameType === "tiebreak_701" ? 1 : 3;
  if (homeLegs === winningLegs && awayLegs < winningLegs) {
    return "home" as const;
  }

  if (awayLegs === winningLegs && homeLegs < winningLegs) {
    return "away" as const;
  }

  return null;
}

function calculateMatchScore(
  games: Array<{ game_type: MatchGameType; home_legs: number; away_legs: number; winner_side?: MatchSide | null }>,
) {
  return games.reduce(
    (score: MatchScore, game) => {
      const winner = calculateWinner(game.game_type, game.home_legs, game.away_legs);
      if (winner === "home") {
        score.home_points += 1;
      } else if (winner === "away") {
        score.away_points += 1;
      }

      score.home_legs += game.home_legs;
      score.away_legs += game.away_legs;
      return score;
    },
    { home_points: 0, away_points: 0, home_legs: 0, away_legs: 0 },
  );
}

function buildStatistics(
  games: MatchGameRow[],
  gamePlayers: MatchGamePlayerRow[],
): PlayerStatistics[] {
  const gameById = new Map(games.map((game) => [game.id, game]));
  const statistics = new Map<string, PlayerStatistics>();

  gamePlayers.forEach((gamePlayer) => {
    const game = gameById.get(gamePlayer.match_game_id);
    if (!game || !game.winner_side || game.game_type !== "singles") {
      return;
    }

    const current = statistics.get(gamePlayer.player_id) ?? {
      player_id: gamePlayer.player_id,
      played_matches: 0,
      won_matches: 0,
      lost_matches: 0,
      played_legs: 0,
      won_legs: 0,
      lost_legs: 0,
    };

    const wonLegs = gamePlayer.side === "home" ? game.home_legs : game.away_legs;
    const lostLegs = gamePlayer.side === "home" ? game.away_legs : game.home_legs;

    current.played_matches += 1;
    current.played_legs += wonLegs + lostLegs;
    current.won_legs += wonLegs;
    current.lost_legs += lostLegs;

    if (game.winner_side === gamePlayer.side) {
      current.won_matches += 1;
    } else {
      current.lost_matches += 1;
    }

    statistics.set(gamePlayer.player_id, current);
  });

  return Array.from(statistics.values());
}

function missingSheetSchemaResponse(errorMessage: string) {
  if (
    errorMessage.includes("public.match_confirmations") ||
    errorMessage.includes("match_confirmations")
  ) {
    return NextResponse.json(
      {
        error:
          "Potvrzení kapitány zatím nejsou vytvořená. Spusťte SQL soubor supabase/apply_match_captain_confirmations_in_dashboard.sql v Supabase SQL Editoru.",
      },
      { status: 500 },
    );
  }

  if (
    errorMessage.includes("public.match_games") ||
    errorMessage.includes("public.match_game_players") ||
    errorMessage.includes("public.match_game_achievements") ||
    errorMessage.includes("public.match_player_slots") ||
    errorMessage.includes("match_game_players.slot_code") ||
    errorMessage.includes("schema cache")
  ) {
    return NextResponse.json(
      {
        error:
          "Tabulky pro zápis utkání zatím nejsou vytvořené. Spusťte SQL soubor supabase/apply_match_sheet_in_dashboard.sql v Supabase SQL Editoru.",
      },
      { status: 500 },
    );
  }

  return null;
}

async function loadSheetData(matchId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single<MatchRow>();

  if (matchError || !match) {
    return { data: null, error: matchError?.message ?? "Zápas nebyl nalezen." };
  }

  const [seasons, leagues, groups, teamSeasons, teams, memberships, players, games, gamePlayers, achievements, slots, confirmations] =
    await Promise.all([
      supabase
        .from("seasons")
        .select("id, name")
        .eq("id", match.season_id)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("leagues")
        .select("id, name")
        .eq("id", match.league_id)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("league_groups")
        .select("id, name")
        .eq("id", match.group_id)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("team_seasons")
        .select("id, team_id, season_id, display_name")
        .in("id", [match.home_team_id, match.away_team_id])
        .is("deleted_at", null)
        .returns<TeamSeasonRow[]>(),
      supabase.from("teams").select("id, name").is("deleted_at", null).returns<TeamRow[]>(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .in("team_season_id", [match.home_team_id, match.away_team_id])
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
      supabase
        .from("players")
        .select("id, display_name, first_name, last_name, nickname")
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .returns<PlayerRow[]>(),
      supabase
        .from("match_games")
        .select("id, match_id, game_type, order_number, home_legs, away_legs, winner_side")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .order("order_number", { ascending: true })
        .returns<MatchGameRow[]>(),
      supabase
        .from("match_game_players")
        .select("id, match_game_id, side, player_id, position, slot_code")
        .is("deleted_at", null)
        .returns<MatchGamePlayerRow[]>(),
      supabase
        .from("match_game_achievements")
        .select("id, match_id, match_game_id, player_id, achievement_type, achievement_count")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .returns<MatchAchievementRow[]>(),
      supabase
        .from("match_player_slots")
        .select("id, match_id, side, slot_code, player_id")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .returns<MatchPlayerSlotRow[]>(),
      supabase
        .from("match_confirmations")
        .select("id, match_id, side, captain_player_id, confirmed_at")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .returns<MatchConfirmationRow[]>(),
    ]);

  const error =
    seasons.error ??
    leagues.error ??
    groups.error ??
    teamSeasons.error ??
    teams.error ??
    memberships.error ??
    players.error ??
    games.error ??
    gamePlayers.error ??
    achievements.error ??
    slots.error ??
    confirmations.error;

  if (error) {
    return { data: null, error: error.message };
  }

  const activeGameIds = new Set((games.data ?? []).map((game) => game.id));
  const relevantGamePlayers = (gamePlayers.data ?? []).filter((gamePlayer) =>
    activeGameIds.has(gamePlayer.match_game_id),
  );
  const gamesByOrder = new Map((games.data ?? []).map((game) => [game.order_number, game]));
  const playersByGame = new Map<string, MatchGamePlayerRow[]>();

  relevantGamePlayers.forEach((gamePlayer) => {
    playersByGame.set(gamePlayer.match_game_id, [
      ...(playersByGame.get(gamePlayer.match_game_id) ?? []),
      gamePlayer,
    ]);
  });

  const sheetGames = getDefaultGames().map((defaultGame) => {
    const savedGame = gamesByOrder.get(defaultGame.order_number);
    if (!savedGame) {
      return defaultGame;
    }

    const assignedPlayers = playersByGame.get(savedGame.id) ?? [];
    const fixedPair = singlesSlotPairs.get(savedGame.order_number);
    const homeSlotCodes = fixedPair
      ? fixedPair.slice(0, 1)
      : assignedPlayers
          .filter((player) => player.side === "home")
          .sort((first, second) => first.position - second.position)
          .map((player) => player.slot_code)
          .filter((slotCode): slotCode is SlotCode => Boolean(slotCode));
    const awaySlotCodes = fixedPair
      ? fixedPair.slice(1, 2)
      : assignedPlayers
          .filter((player) => player.side === "away")
          .sort((first, second) => first.position - second.position)
          .map((player) => player.slot_code)
          .filter((slotCode): slotCode is SlotCode => Boolean(slotCode));
    const playerIdsForSide = (side: MatchSide, slotCodes: SlotCode[]) => {
      const sidePlayers = assignedPlayers.filter((player) => player.side === side);
      const positions = Math.max(slotCodes.length, sidePlayers.length);
      return Array.from(
        { length: positions },
        (_, index) => sidePlayers.find((player) => player.position === index + 1)?.player_id ?? "",
      );
    };

    return {
      id: savedGame.id,
      match_id: savedGame.match_id,
      game_type: normalizeGameType(savedGame.game_type),
      order_number: savedGame.order_number,
      home_legs: savedGame.home_legs,
      away_legs: savedGame.away_legs,
      winner_side: savedGame.winner_side,
      home_player_ids: playerIdsForSide("home", homeSlotCodes),
      away_player_ids: playerIdsForSide("away", awaySlotCodes),
      home_slot_codes: homeSlotCodes,
      away_slot_codes: awaySlotCodes,
    };
  });

  const matchScore = calculateMatchScore(sheetGames);
  const statistics = buildStatistics(games.data ?? [], relevantGamePlayers);

  return {
    data: {
      match,
      season: seasons.data,
      league: leagues.data,
      group: groups.data,
      teamSeasons: teamSeasons.data ?? [],
      teams: teams.data ?? [],
      memberships: memberships.data ?? [],
      players: players.data ?? [],
      games: sheetGames,
      achievements: achievements.data ?? [],
      slots: slots.data ?? [],
      confirmations: confirmations.data ?? [],
      matchScore,
      statistics,
    },
    error: null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { id } = await context.params;
    const { data, error } = await loadSheetData(id);

    if (error) {
      const schemaResponse = missingSheetSchemaResponse(error);
      if (schemaResponse) {
        return schemaResponse;
      }

      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Zápis se nepodařilo načíst." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as SaveSheetBody | null;
  const submittedGames = Array.isArray(body?.games) ? body.games : [];
  const submittedAchievements = Array.isArray(body?.achievements)
    ? body.achievements
    : [];
  const submittedSlots = Array.isArray(body?.slots) ? body.slots : [];

  const submittedCheckoutTotals = new Map<string, number>();
  for (const item of submittedAchievements) {
    const achievement = typeof item === "object" && item !== null ? item as SubmittedAchievement : {};
    const playerId = parseString(achievement.player_id);
    const achievementType = parseString(achievement.achievement_type);
    const achievementCount = parseInteger(achievement.achievement_count) ?? 0;
    if (!playerId || achievementType !== "checkout_100_plus") {
      continue;
    }

    const total = (submittedCheckoutTotals.get(playerId) ?? 0) + achievementCount;
    if (total > 3) {
      return NextResponse.json(
        { error: "Zavření 100+ může mít jeden hráč v zápasu nejvýše 3×." },
        { status: 400 },
      );
    }
    submittedCheckoutTotals.set(playerId, total);
  }

  const { id: matchId } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const slotsToInsert = submittedSlots
    .map((item): SubmittedSlot => (typeof item === "object" && item !== null ? item : {}))
    .map((slot) => {
      const side = parseString(slot.side);
      const slotCode = parseString(slot.slot_code);
      const playerId = parseString(slot.player_id);

      if (
        (side !== "home" && side !== "away") ||
        !slotCode ||
        !isSlotForSide(side, slotCode) ||
        !playerId
      ) {
        return null;
      }

      return {
        match_id: matchId,
        side: side as MatchSide,
        slot_code: slotCode as SlotCode,
        player_id: playerId,
      };
    })
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));

  if (slotsToInsert.length !== submittedSlots.length) {
    return NextResponse.json({ error: "Některá pozice hráče není platná." }, { status: 400 });
  }

  const slotByKey = new Map<string, (typeof slotsToInsert)[number]>();
  const slotBySideAndPlayer = new Map<string, (typeof slotsToInsert)[number]>();

  for (const slot of slotsToInsert) {
    const currentSlotKey = slotKey(slot.side, slot.slot_code);
    const currentPlayerKey = `${slot.side}:${slot.player_id}`;

    if (slotByKey.has(currentSlotKey)) {
      return NextResponse.json(
        { error: `Pozice ${slot.slot_code} už má přiřazeného hráče.` },
        { status: 400 },
      );
    }

    if (slotBySideAndPlayer.has(currentPlayerKey)) {
      return NextResponse.json(
        { error: "Tento hráč už je nasazený na jiné pozici." },
        { status: 400 },
      );
    }

    slotByKey.set(currentSlotKey, slot);
    slotBySideAndPlayer.set(currentPlayerKey, slot);
  }

  const [matchResult, membershipsResult, existingGamesResult] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, home_team_id, away_team_id")
        .eq("id", matchId)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
      supabase
        .from("match_games")
        .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .returns<MatchGameRow[]>(),
    ]);

  const preflightError =
    matchResult.error ??
    membershipsResult.error ??
    existingGamesResult.error;

  if (preflightError || !matchResult.data) {
    return NextResponse.json(
      { error: preflightError?.message ?? "Zápas nebyl nalezen." },
      { status: 500 },
    );
  }

  const homePlayerIds = new Set(
    (membershipsResult.data ?? [])
      .filter((membership) => membership.team_season_id === matchResult.data.home_team_id)
      .map((membership) => membership.player_id),
  );
  const awayPlayerIds = new Set(
    (membershipsResult.data ?? [])
      .filter((membership) => membership.team_season_id === matchResult.data.away_team_id)
      .map((membership) => membership.player_id),
  );

  for (const slot of slotsToInsert) {
    const teamPlayerIds = slot.side === "home" ? homePlayerIds : awayPlayerIds;
    if (!teamPlayerIds.has(slot.player_id)) {
      return NextResponse.json(
        { error: "Vybraný hráč nepatří do příslušného týmu." },
        { status: 400 },
      );
    }
  }

  const existingGames = existingGamesResult.data ?? [];
  const existingGameIds = existingGames.map((game) => game.id);
  const gamesToInsert = submittedGames
    .map((item): SubmittedGame => (typeof item === "object" && item !== null ? item : {}))
    .map((game) => {
      const orderNumber = parseInteger(game.order_number);
      const gameType = parseString(game.game_type);
      const homeLegs = parseInteger(game.home_legs) ?? 0;
      const awayLegs = parseInteger(game.away_legs) ?? 0;
      const normalizedGameType = gameType as MatchGameType;
      const winningLegs = normalizedGameType === "tiebreak_701" ? 1 : 3;
      const winnerSide = calculateWinner(normalizedGameType, homeLegs, awayLegs);
      const fixedPair = orderNumber ? singlesSlotPairs.get(orderNumber) : null;
      const submittedHomeSlotCodes = Array.isArray(game.home_slot_codes)
        ? game.home_slot_codes.map(parseString).filter((value): value is string => Boolean(value))
        : [];
      const submittedAwaySlotCodes = Array.isArray(game.away_slot_codes)
        ? game.away_slot_codes.map(parseString).filter((value): value is string => Boolean(value))
        : [];
      const homeSlotCodes: SlotCode[] = fixedPair
        ? fixedPair.slice(0, 1)
        : submittedHomeSlotCodes as SlotCode[];
      const awaySlotCodes: SlotCode[] = fixedPair
        ? fixedPair.slice(1, 2)
        : submittedAwaySlotCodes as SlotCode[];

      if (!orderNumber || !gameType || !gameTypes.includes(gameType as MatchGameType)) {
        return null;
      }

      if (
        homeLegs > winningLegs ||
        awayLegs > winningLegs ||
        (homeLegs === winningLegs && awayLegs === winningLegs)
      ) {
        return null;
      }

      if (
        homeSlotCodes.length > 2 ||
        awaySlotCodes.length > 2 ||
        new Set(homeSlotCodes).size !== homeSlotCodes.length ||
        new Set(awaySlotCodes).size !== awaySlotCodes.length ||
        homeSlotCodes.some((slotCode) => !isSlotForSide("home", slotCode)) ||
        awaySlotCodes.some((slotCode) => !isSlotForSide("away", slotCode))
      ) {
        return null;
      }

      return {
        match_id: matchId,
        game_type: normalizedGameType,
        order_number: orderNumber,
        home_legs: homeLegs,
        away_legs: awayLegs,
        winner_side: winnerSide,
        home_slot_codes: homeSlotCodes,
        away_slot_codes: awaySlotCodes,
        home_player_ids: Array.isArray(game.home_player_ids)
          ? game.home_player_ids.map((playerId) => parseString(playerId) ?? "")
          : [],
        away_player_ids: Array.isArray(game.away_player_ids)
          ? game.away_player_ids.map((playerId) => parseString(playerId) ?? "")
          : [],
      };
    })
    .filter((game): game is NonNullable<typeof game> => Boolean(game));

  if (gamesToInsert.length !== submittedGames.length) {
    return NextResponse.json(
      { error: "Každá hra musí mít platný počet legů. Běžné hry se hrají na 3 vítězné legy." },
      { status: 400 },
    );
  }

  const coreScore = calculateMatchScore(
    gamesToInsert.filter((game) => game.order_number <= 18),
  );
  const tiebreak = gamesToInsert.find((game) => game.game_type === "tiebreak_701");
  const tiebreakRequired = coreScore.home_points === 9 && coreScore.away_points === 9;

  if (!tiebreakRequired && tiebreak) {
    return NextResponse.json(
      { error: "Rozstřel 701 DO se hraje pouze při stavu utkání 9:9." },
      { status: 400 },
    );
  }

  const usedSlotBySideAndPlayer = new Map<string, SlotCode>();
  for (const game of gamesToInsert) {
    for (const side of ["home", "away"] as const) {
      const slotCodes = side === "home" ? game.home_slot_codes : game.away_slot_codes;
      const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
      const teamPlayerIds = side === "home" ? homePlayerIds : awayPlayerIds;

      for (const [index, playerId] of playerIds.entries()) {
        if (!playerId) {
          continue;
        }

        const slotCode = slotCodes[index];
        if (!slotCode) {
          return NextResponse.json(
            { error: "Vyberte pozici pro každého hráče v párové hře." },
            { status: 400 },
          );
        }

        if (!teamPlayerIds.has(playerId)) {
          return NextResponse.json(
            { error: "Vybraný hráč nepatří do příslušného týmu." },
            { status: 400 },
          );
        }

        const playerKey = `${side}:${playerId}`;
        const usedSlot = usedSlotBySideAndPlayer.get(playerKey);
        if (usedSlot && usedSlot !== slotCode) {
          return NextResponse.json(
            { error: "Tento hráč už je nasazený na jiné pozici." },
            { status: 400 },
          );
        }

        usedSlotBySideAndPlayer.set(playerKey, slotCode);
      }
    }
  }

  const deletedAt = new Date().toISOString();

  const submittedOrders = new Set(gamesToInsert.map((game) => game.order_number));
  const staleGameIds = existingGames
    .filter((game) => !submittedOrders.has(game.order_number))
    .map((game) => game.id);

  const existingGameByOrder = new Map(existingGames.map((game) => [game.order_number, game]));
  const savedGames: MatchGameRow[] = [];

  for (const game of gamesToInsert) {
    const values = {
        match_id: matchId,
        game_type: game.game_type,
        order_number: game.order_number,
        home_legs: game.home_legs,
        away_legs: game.away_legs,
        winner_side: game.winner_side,
    };
    const existingGame = existingGameByOrder.get(game.order_number);
    const query = existingGame
      ? supabase
          .from("match_games")
          .update(values)
          .eq("id", existingGame.id)
      : supabase
          .from("match_games")
          .insert(values);
    const { data, error } = await query
      .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side")
      .single<MatchGameRow>();

    if (error) {
      return NextResponse.json(
        {
          error: error.message.includes("match_games_") && error.message.includes("order_valid")
            ? "Databáze stále používá staré pořadí her. Spusťte SQL soubor supabase/apply_match_game_constraint_fix_in_dashboard.sql v Supabase SQL Editoru."
            : error.message,
        },
        { status: 500 },
      );
    }

    savedGames.push(data);
  }

  const { error: slotsDeleteError } = await supabase
    .from("match_player_slots")
    .update({ deleted_at: deletedAt })
    .eq("match_id", matchId)
    .is("deleted_at", null);

  if (slotsDeleteError) {
    return NextResponse.json({ error: slotsDeleteError.message }, { status: 500 });
  }

  if (slotsToInsert.length > 0) {
    const { error: slotsInsertError } = await supabase
      .from("match_player_slots")
      .insert(slotsToInsert);

    if (slotsInsertError) {
      return NextResponse.json({ error: slotsInsertError.message }, { status: 500 });
    }
  }

  if (existingGameIds.length > 0) {
    const [playersDelete, achievementsDelete] = await Promise.all([
      supabase
        .from("match_game_players")
        .update({ deleted_at: deletedAt })
        .in("match_game_id", existingGameIds)
        .is("deleted_at", null),
      supabase
        .from("match_game_achievements")
        .update({ deleted_at: deletedAt })
        .eq("match_id", matchId)
        .is("deleted_at", null),
    ]);

    const deleteError = playersDelete.error ?? achievementsDelete.error;
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  if (staleGameIds.length > 0) {
    const { error } = await supabase
      .from("match_games")
      .update({ deleted_at: deletedAt })
      .in("id", staleGameIds)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const insertedGameByOrder = new Map(
    savedGames.map((game) => [game.order_number, game]),
  );
  const playerRows = gamesToInsert.flatMap((game) => {
    const insertedGame = insertedGameByOrder.get(game.order_number);
    if (!insertedGame) {
      return [];
    }

    return [
      ...game.home_player_ids.flatMap((playerId, index) => playerId ? [{
        match_game_id: insertedGame.id,
        side: "home" as const,
        player_id: playerId,
        position: index + 1,
        slot_code: game.home_slot_codes[index] ?? null,
      }] : []),
      ...game.away_player_ids.flatMap((playerId, index) => playerId ? [{
        match_game_id: insertedGame.id,
        side: "away" as const,
        player_id: playerId,
        position: index + 1,
        slot_code: game.away_slot_codes[index] ?? null,
      }] : []),
    ];
  });

  if (playerRows.length > 0) {
    const { error } = await supabase.from("match_game_players").insert(playerRows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const achievementRows = submittedAchievements
    .map((item): SubmittedAchievement =>
      typeof item === "object" && item !== null ? item : {},
    )
    .map((achievement) => {
      const orderNumber = parseInteger(achievement.order_number);
      const playerId = parseString(achievement.player_id);
      const achievementType = parseString(achievement.achievement_type);
      const achievementCount = parseInteger(achievement.achievement_count) ?? 1;
      const insertedGame = orderNumber ? insertedGameByOrder.get(orderNumber) : null;

      if (
        !orderNumber ||
        !insertedGame ||
        insertedGame.game_type !== "singles" ||
        !playerId ||
        !achievementType ||
        !achievementTypes.includes(achievementType as AchievementType)
      ) {
        return null;
      }

      return {
        match_id: matchId,
        match_game_id: insertedGame.id,
        player_id: playerId,
        achievement_type: achievementType as AchievementType,
        achievement_count: Math.max(1, achievementCount),
      };
    })
    .filter((achievement): achievement is NonNullable<typeof achievement> =>
      Boolean(achievement),
    );

  const checkoutTotals = new Map<string, number>();
  for (const achievement of achievementRows) {
    if (achievement.achievement_type !== "checkout_100_plus") {
      continue;
    }

    const total = (checkoutTotals.get(achievement.player_id) ?? 0) + achievement.achievement_count;
    if (total > 3) {
      return NextResponse.json(
        { error: "Zavření 100+ může mít jeden hráč v zápasu nejvýše 3×." },
        { status: 400 },
      );
    }

    checkoutTotals.set(achievement.player_id, total);
  }

  if (achievementRows.length > 0) {
    const { error } = await supabase.from("match_game_achievements").insert(achievementRows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const matchScore = calculateMatchScore(gamesToInsert);
  const completedCoreGames = gamesToInsert.filter(
    (game) => game.order_number <= 18 && Boolean(game.winner_side),
  ).length;
  const isComplete =
    completedCoreGames === 18 &&
    (!tiebreakRequired || Boolean(tiebreak?.winner_side));
  const { data: existingResult, error: existingResultError } = await supabase
    .from("match_results")
    .select("id")
    .eq("match_id", matchId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingResultError) {
    return NextResponse.json({ error: existingResultError.message }, { status: 500 });
  }

  const resultQuery = existingResult
    ? supabase
        .from("match_results")
        .update({
          home_points: matchScore.home_points,
          away_points: matchScore.away_points,
        })
        .eq("id", existingResult.id)
    : supabase.from("match_results").insert({
        match_id: matchId,
        home_points: matchScore.home_points,
        away_points: matchScore.away_points,
      });

  const { error: resultError } = await resultQuery;
  if (resultError) {
    return NextResponse.json({ error: resultError.message }, { status: 500 });
  }

  const { error: matchUpdateError } = await supabase
    .from("matches")
    .update({
      status: isComplete ? "awaiting_confirmation" : "scheduled",
      played_at: isComplete ? new Date().toISOString() : null,
    })
    .eq("id", matchId);

  if (matchUpdateError) {
    return NextResponse.json(
      {
        error: matchUpdateError.message.includes("awaiting_confirmation")
          ? "Nejprve spusťte SQL soubor supabase/apply_match_captain_confirmations_in_dashboard.sql v Supabase SQL Editoru."
          : matchUpdateError.message,
      },
      { status: 500 },
    );
  }

  const { error: confirmationsDeleteError } = await supabase
    .from("match_confirmations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .is("deleted_at", null);

  if (confirmationsDeleteError) {
    const schemaResponse = missingSheetSchemaResponse(confirmationsDeleteError.message);
    return schemaResponse ?? NextResponse.json({ error: confirmationsDeleteError.message }, { status: 500 });
  }

  const { data, error } = await loadSheetData(matchId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json(data);
}
