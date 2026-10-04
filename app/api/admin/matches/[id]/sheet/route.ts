import { NextResponse } from "next/server";
import { hasAtLeastRole, type AppRole } from "@/lib/appAuth";
import { authorizeMatchAccess } from "@/lib/matchAccess";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

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

type AutosaveCell =
  | {
      type?: "legs";
      order_number?: unknown;
      home_legs?: unknown;
      away_legs?: unknown;
      expected_updated_at?: unknown;
    }
  | {
      type?: "player";
      order_number?: unknown;
      side?: unknown;
      position?: unknown;
      slot_code?: unknown;
      player_id?: unknown;
    }
  | {
      type?: "game";
      expected_updated_at?: unknown;
      game?: unknown;
    }
  | {
      type?: "achievement";
      achievement?: unknown;
    }
  | {
      type?: "lineup_reveal";
      side?: unknown;
      block_number?: unknown;
    };

type SubmittedAchievement = {
  order_number?: unknown;
  player_id?: unknown;
  achievement_type?: unknown;
  achievement_count?: unknown;
};

type SaveSheetBody = {
  cell?: unknown;
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
  slug: string;
  logo_url?: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

type MembershipRow = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
};

type MatchGameRow = {
  id: string;
  match_id: string;
  game_type: MatchGameType;
  order_number: number;
  home_legs: number;
  away_legs: number;
  winner_side: MatchSide | null;
  updated_at: string;
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

type MatchSheetAuditSource = "captain_sheet" | "admin_sheet" | "system" | "repair" | "migration";

type MatchSheetAuditContext = {
  actorUserId: string | null;
  actorPlayerId: string | null;
  actorRole: AppRole | null;
  actorTeamSeasonId: string | null;
  requestId: string;
  source: MatchSheetAuditSource;
};

type MatchBlockLineupRevealRow = {
  id: string;
  match_id: string;
  side: MatchSide;
  block_number: number;
  revealed_by_player_id: string | null;
  revealed_at: string;
};

type SheetViewerContext = {
  side: MatchSide | null;
  canManageBothSides: boolean;
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
const maxLineupRevealBlockNumber = 8;
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

function parseSide(value: unknown): MatchSide | null {
  return value === "home" || value === "away" ? value : null;
}

function blockNumberForOrder(orderNumber: number) {
  if (orderNumber >= 1 && orderNumber <= 4) return 1;
  if (orderNumber >= 5 && orderNumber <= 8) return 2;
  if (orderNumber >= 9 && orderNumber <= 10) return 3;
  if (orderNumber >= 11 && orderNumber <= 12) return 4;
  if (orderNumber >= 13 && orderNumber <= 14) return 5;
  if (orderNumber >= 15 && orderNumber <= 16) return 6;
  if (orderNumber >= 17 && orderNumber <= 18) return 7;
  if (orderNumber === 19) return 8;
  return null;
}

function revealKey(side: MatchSide, blockNumber: number) {
  return `${side}:${blockNumber}`;
}

function isBlockMutuallyRevealed(reveals: Set<string>, blockNumber: number) {
  return reveals.has(revealKey("home", blockNumber)) && reveals.has(revealKey("away", blockNumber));
}

function normalizedTeamName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMissingLineupRevealSchema(message: string) {
  return message.includes("match_block_lineup_reveals") || message.includes("schema cache");
}

function preferTeamSideForRequest(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("view") === "team") {
    return true;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).pathname.startsWith("/muj-tym/zapasy/");
  } catch {
    return false;
  }
}

function viewerContextForMatch(
  requester: { role?: AppRole; playerId?: string | null } | null,
  match: Pick<MatchRow, "home_team_id" | "away_team_id">,
  memberships: MembershipRow[],
  options: { forcedTeamSide?: MatchSide | null; preferTeamSide?: boolean } = {},
): SheetViewerContext {
  if (options.forcedTeamSide && options.preferTeamSide) {
    return {
      side: options.forcedTeamSide,
      canManageBothSides: false,
    };
  }

  const membership = memberships.find(
    (item) =>
      item.player_id === requester?.playerId &&
      (item.member_role === "captain" || item.member_role === "assistant_captain") &&
      (item.team_season_id === match.home_team_id || item.team_season_id === match.away_team_id),
  );

  if (membership && options.preferTeamSide) {
    return {
      side: membership.team_season_id === match.home_team_id ? "home" : "away",
      canManageBothSides: false,
    };
  }

  if (options.preferTeamSide) {
    return { side: null, canManageBothSides: false };
  }

  if (!requester || hasAtLeastRole(requester.role, "moderator")) {
    return { side: null, canManageBothSides: true };
  }

  if (!membership) {
    return { side: null, canManageBothSides: false };
  }

  return {
    side: membership.team_season_id === match.home_team_id ? "home" : "away",
    canManageBothSides: false,
  };
}

async function resolveRequestedTeamSide(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  requester: { playerId?: string | null } | null,
  match: Pick<MatchRow, "home_team_id" | "away_team_id">,
  matchTeamSeasons: TeamSeasonRow[],
  teamSeasonId: string | null | undefined,
) {
  if (!requester?.playerId) return null;
  const requestedSide: MatchSide | null = teamSeasonId
    ? teamSeasonId === match.home_team_id
      ? "home"
      : teamSeasonId === match.away_team_id
        ? "away"
        : null
    : null;
  if (teamSeasonId && !requestedSide) return null;

  const requestedTeamSeason = teamSeasonId
    ? matchTeamSeasons.find((teamSeason) => teamSeason.id === teamSeasonId)
    : null;
  if (teamSeasonId && !requestedTeamSeason) return null;

  const { data: leadershipMemberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("team_season_id")
    .eq("player_id", requester.playerId)
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .returns<Array<{ team_season_id: string }>>();

  if (membershipError || !leadershipMemberships || leadershipMemberships.length === 0) {
    return null;
  }

  const leadershipTeamSeasonIds = leadershipMemberships.map((membership) => membership.team_season_id);
  const { data: leadershipTeamSeasons, error: teamSeasonError } = await supabase
    .from("team_seasons")
    .select("id, team_id, display_name")
    .in("id", leadershipTeamSeasonIds)
    .is("deleted_at", null)
    .returns<Array<{ id: string; team_id: string; display_name: string | null }>>();

  if (teamSeasonError) return null;

  const leadershipTeamIds = new Set((leadershipTeamSeasons ?? []).map((teamSeason) => teamSeason.team_id));
  const allTeamIds = Array.from(
    new Set([
      ...matchTeamSeasons.map((teamSeason) => teamSeason.team_id),
      ...(leadershipTeamSeasons ?? []).map((teamSeason) => teamSeason.team_id),
    ]),
  );
  const { data: teams } = allTeamIds.length > 0
    ? await supabase
        .from("teams")
        .select("id, name")
        .in("id", allTeamIds)
        .is("deleted_at", null)
        .returns<Array<{ id: string; name: string }>>()
    : { data: [] as Array<{ id: string; name: string }> };
  const teamNameById = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const leadershipNames = new Set(
    (leadershipTeamSeasons ?? [])
      .flatMap((teamSeason) => [teamSeason.display_name, teamNameById.get(teamSeason.team_id)])
      .map(normalizedTeamName)
      .filter(Boolean),
  );
  const matchesLeadershipTeam = (teamSeason: TeamSeasonRow) => {
    if (leadershipTeamIds.has(teamSeason.team_id)) return true;
    const names = [teamSeason.display_name, teamNameById.get(teamSeason.team_id)].map(normalizedTeamName);
    return names.some((name) => name && leadershipNames.has(name));
  };

  if (requestedTeamSeason && requestedSide) {
    return matchesLeadershipTeam(requestedTeamSeason) ? requestedSide : null;
  }

  const matchingSides = matchTeamSeasons
    .map((teamSeason): MatchSide | null => {
      if (!matchesLeadershipTeam(teamSeason)) return null;
      if (teamSeason.id === match.home_team_id) return "home";
      if (teamSeason.id === match.away_team_id) return "away";
      return null;
    })
    .filter((side): side is MatchSide => Boolean(side));

  return matchingSides.length === 1 ? matchingSides[0] : null;
}

async function forcedTeamSideForRequest(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  requester: { playerId?: string | null } | null,
  match: Pick<MatchRow, "home_team_id" | "away_team_id">,
  teamSeasonId: string | null | undefined,
) {
  const matchTeamSeasonIds = [match.home_team_id, match.away_team_id];
  const { data: matchTeamSeasons } = await supabase
    .from("team_seasons")
    .select("id, team_id, season_id, display_name")
    .in("id", matchTeamSeasonIds)
    .is("deleted_at", null)
    .returns<TeamSeasonRow[]>();

  return resolveRequestedTeamSide(supabase, requester, match, matchTeamSeasons ?? [], teamSeasonId);
}

function canViewerSeeSideInBlock(
  viewer: SheetViewerContext,
  lineupsVisibleForAll: boolean,
  revealSchemaReady: boolean,
  reveals: Set<string>,
  side: MatchSide,
  blockNumber: number | null,
) {
  if (lineupsVisibleForAll || viewer.canManageBothSides || viewer.side === side || !blockNumber) {
    return true;
  }

  return isBlockMutuallyRevealed(reveals, blockNumber);
}

async function confirmedSidesForMatch(supabase: ReturnType<typeof createSupabaseAdminClient>, matchId: string) {
  const { data, error } = await supabase
    .from("match_confirmations")
    .select("side")
    .eq("match_id", matchId)
    .is("deleted_at", null)
    .returns<Array<{ side: MatchSide }>>();

  if (error) {
    return { confirmedSides: new Set<MatchSide>(), error };
  }

  return { confirmedSides: new Set((data ?? []).map((confirmation) => confirmation.side)), error: null };
}

function lockedSideResponse() {
  return NextResponse.json(
    { error: "Tato strana už zápis potvrdila. Změny může znovu povolit jen moderátor nebo administrátor tlačítkem Odemknout." },
    { status: 423 },
  );
}

function lockedConfirmedMatchResponse() {
  return NextResponse.json(
    { error: "Potvrzeny zapis je uzamceny. Nejprve jej odemknete k oprave." },
    { status: 423 },
  );
}

function hasOwnField(value: object, field: string) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function createRequestId() {
  return crypto.randomUUID();
}

function auditSourceForRequester(requester: { role?: AppRole } | null): MatchSheetAuditSource {
  if (!requester) return "system";
  return hasAtLeastRole(requester.role, "moderator") ? "admin_sheet" : "captain_sheet";
}

function auditContextForRequester(
  requester: { userId?: string; playerId?: string | null; role?: AppRole } | null,
  match: Pick<MatchRow, "home_team_id" | "away_team_id"> | null,
  viewer: SheetViewerContext | null,
  requestId: string,
): MatchSheetAuditContext {
  return {
    actorUserId: requester?.userId ?? null,
    actorPlayerId: requester?.playerId ?? null,
    actorRole: requester?.role ?? null,
    actorTeamSeasonId:
      viewer?.side === "home"
        ? match?.home_team_id ?? null
        : viewer?.side === "away"
          ? match?.away_team_id ?? null
          : null,
    requestId,
    source: auditSourceForRequester(requester),
  };
}

async function insertMatchSheetAudit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  entry: {
    matchId: string;
    gameId?: string | null;
    entityType:
      | "match"
      | "match_game"
      | "match_game_player"
      | "match_game_achievement"
      | "match_player_slot"
      | "match_block_lineup_reveal"
      | "match_confirmation";
    entityId?: string | null;
    fieldName: string;
    operation: "insert" | "update" | "soft_delete" | "confirm" | "unlock" | "status_update";
    oldValue?: unknown;
    newValue?: unknown;
    context: MatchSheetAuditContext;
  },
) {
  const { error } = await supabase.from("match_sheet_audit_logs").insert({
    match_id: entry.matchId,
    game_id: entry.gameId ?? null,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    field_name: entry.fieldName,
    operation: entry.operation,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    actor_user_id: entry.context.actorUserId,
    actor_player_id: entry.context.actorPlayerId,
    actor_role: entry.context.actorRole,
    actor_team_season_id: entry.context.actorTeamSeasonId,
    source: entry.context.source,
    request_id: entry.context.requestId,
  });

  return error;
}

function playerSnapshot(player: Pick<PlayerRow, "id" | "display_name" | "first_name" | "last_name"> | null | undefined) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.display_name,
    first_name: player.first_name,
    last_name: player.last_name,
  };
}

function isSlotForSide(side: MatchSide, slotCode: string): slotCode is SlotCode {
  return side === "home"
    ? homeSlotCodes.includes(slotCode as HomeSlotCode)
    : awaySlotCodes.includes(slotCode as AwaySlotCode);
}

function playerLimitForGame(gameType: MatchGameType) {
  return gameType === "singles" ? 1 : 2;
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
      updated_at: null as string | null,
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
    errorMessage.includes("public.match_block_lineup_reveals") ||
    errorMessage.includes("match_block_lineup_reveals") ||
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

async function loadSheetData(
  matchId: string,
  requester: { role?: AppRole; playerId?: string | null } | null = null,
  options: { preferTeamSide?: boolean; teamSeasonId?: string | null } = {},
) {
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

  const [seasons, leagues, groups, teamSeasons, teamsWithOptionalColumns, memberships, players, games, achievements, slots, confirmations, revealResult] =
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
      supabase.from("teams").select("id, name, slug, logo_url").is("deleted_at", null).returns<TeamRow[]>(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .in("team_season_id", [match.home_team_id, match.away_team_id])
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
      supabase
        .from("players")
        .select("id, display_name, first_name, last_name")
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .returns<PlayerRow[]>(),
      supabase
        .from("match_games")
        .select("id, match_id, game_type, order_number, home_legs, away_legs, winner_side, updated_at")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .order("order_number", { ascending: true })
        .returns<MatchGameRow[]>(),
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
      supabase
        .from("match_block_lineup_reveals")
        .select("id, match_id, side, block_number, revealed_by_player_id, revealed_at")
        .eq("match_id", matchId)
        .is("deleted_at", null)
        .returns<MatchBlockLineupRevealRow[]>(),
    ]);

  let teams = teamsWithOptionalColumns;
  if (
    teamsWithOptionalColumns.error?.message &&
    teamsWithOptionalColumns.error.message.includes("logo_url")
  ) {
    const fallback = await supabase
      .from("teams")
      .select("id, name, slug")
      .is("deleted_at", null)
      .returns<TeamRow[]>();
    teams = fallback;
  }

  const revealSchemaReady = !revealResult.error || !isMissingLineupRevealSchema(revealResult.error.message);
  const lineupReveals = revealResult.error && !revealSchemaReady ? [] : revealResult.data ?? [];

  const error =
    seasons.error ??
    leagues.error ??
    groups.error ??
    teamSeasons.error ??
    teams.error ??
    memberships.error ??
    players.error ??
    games.error ??
    achievements.error ??
    slots.error ??
    confirmations.error ??
    (revealResult.error && revealSchemaReady ? revealResult.error : null);

  if (error) {
    return { data: null, error: error.message };
  }

  const activeGameIds = (games.data ?? []).map((game) => game.id);
  const gamePlayers = activeGameIds.length > 0
    ? await supabase
        .from("match_game_players")
        .select("id, match_game_id, side, player_id, position, slot_code")
        .in("match_game_id", activeGameIds)
        .is("deleted_at", null)
        .returns<MatchGamePlayerRow[]>()
    : { data: [] as MatchGamePlayerRow[], error: null };

  if (gamePlayers.error) {
    return { data: null, error: gamePlayers.error.message };
  }

  const forcedTeamSide = options.preferTeamSide
    ? await resolveRequestedTeamSide(supabase, requester, match, teamSeasons.data ?? [], options.teamSeasonId)
    : null;
  const viewer = viewerContextForMatch(requester, match, memberships.data ?? [], { ...options, forcedTeamSide });
  const lineupsVisibleForAll = match.status === "confirmed";
  const activeGameIdSet = new Set(activeGameIds);
  const relevantGamePlayers = (gamePlayers.data ?? []).filter((gamePlayer) =>
    activeGameIdSet.has(gamePlayer.match_game_id),
  );
  const revealSet = new Set(lineupReveals.map((reveal) => revealKey(reveal.side, reveal.block_number)));
  const gamesByOrder = new Map((games.data ?? []).map((game) => [game.order_number, game]));
  const playersByGame = new Map<string, MatchGamePlayerRow[]>();
  const visiblePlayerIds = new Set<string>();

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
    const playerIdsForSide = (side: MatchSide, slotCodes: SlotCode[], gameType: MatchGameType) => {
      const sidePlayers = assignedPlayers.filter((player) => player.side === side);
      const positions = Math.min(playerLimitForGame(gameType), Math.max(slotCodes.length, sidePlayers.length));
      return Array.from(
        { length: positions },
        (_, index) => sidePlayers.find((player) => player.position === index + 1)?.player_id ?? "",
      );
    };

    const normalizedGameType = normalizeGameType(savedGame.game_type);
    const blockNumber = blockNumberForOrder(savedGame.order_number);
    const canSeeHome = canViewerSeeSideInBlock(viewer, lineupsVisibleForAll, revealSchemaReady, revealSet, "home", blockNumber);
    const canSeeAway = canViewerSeeSideInBlock(viewer, lineupsVisibleForAll, revealSchemaReady, revealSet, "away", blockNumber);
    const homePlayerIds = canSeeHome
      ? playerIdsForSide("home", homeSlotCodes, normalizedGameType)
      : Array.from({ length: playerLimitForGame(normalizedGameType) }, () => "");
    const awayPlayerIds = canSeeAway
      ? playerIdsForSide("away", awaySlotCodes, normalizedGameType)
      : Array.from({ length: playerLimitForGame(normalizedGameType) }, () => "");

    homePlayerIds.filter(Boolean).forEach((playerId) => visiblePlayerIds.add(playerId));
    awayPlayerIds.filter(Boolean).forEach((playerId) => visiblePlayerIds.add(playerId));

    return {
      id: savedGame.id,
      match_id: savedGame.match_id,
      updated_at: savedGame.updated_at,
      game_type: normalizedGameType,
      order_number: savedGame.order_number,
      home_legs: savedGame.home_legs,
      away_legs: savedGame.away_legs,
      winner_side: savedGame.winner_side,
      home_player_ids: homePlayerIds,
      away_player_ids: awayPlayerIds,
      home_slot_codes: homeSlotCodes,
      away_slot_codes: awaySlotCodes,
    };
  });

  const matchScore = calculateMatchScore(sheetGames);
  const visibleGamePlayers = lineupsVisibleForAll || viewer.canManageBothSides
    ? relevantGamePlayers
    : relevantGamePlayers.filter((gamePlayer) => visiblePlayerIds.has(gamePlayer.player_id));
  const visibleAchievements = lineupsVisibleForAll || viewer.canManageBothSides
    ? achievements.data ?? []
    : (achievements.data ?? []).filter((achievement) => visiblePlayerIds.has(achievement.player_id));
  const statistics = buildStatistics(games.data ?? [], visibleGamePlayers);
  const visiblePayloadPlayerIds = new Set<string>();
  if (!viewer.canManageBothSides) {
    const viewerTeamSeasonId =
      viewer.side === "home" ? match.home_team_id : viewer.side === "away" ? match.away_team_id : null;

    (memberships.data ?? []).forEach((membership) => {
      if (viewerTeamSeasonId && membership.team_season_id === viewerTeamSeasonId) {
        visiblePayloadPlayerIds.add(membership.player_id);
      }
    });
    visiblePlayerIds.forEach((playerId) => visiblePayloadPlayerIds.add(playerId));
  }
  const visiblePlayers = viewer.canManageBothSides
    ? players.data ?? []
    : (players.data ?? []).filter((player) => visiblePayloadPlayerIds.has(player.id));
  const teamsWithLogos = (teams.data ?? []).map((team) => ({
    ...team,
    logo_url: teamLogoUrl(team.slug, team.logo_url),
  }));

  return {
    data: {
      match,
      season: seasons.data,
      league: leagues.data,
      group: groups.data,
      teamSeasons: teamSeasons.data ?? [],
      teams: teamsWithLogos,
      memberships: memberships.data ?? [],
      players: visiblePlayers,
      games: sheetGames,
      achievements: visibleAchievements,
      slots: slots.data ?? [],
      confirmations: confirmations.data ?? [],
      lineupReveals,
      lineupRevealSchemaReady: revealSchemaReady,
      viewer,
      matchScore,
      statistics,
    },
    error: null,
  };
}

async function updateMatchSummary(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string,
  confirmationSideToDelete?: MatchSide | null,
  auditContext?: MatchSheetAuditContext,
) {
  const { data: games, error: gamesError } = await supabase
    .from("match_games")
    .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
    .eq("match_id", matchId)
    .is("deleted_at", null)
    .returns<MatchGameRow[]>();

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  const coreGames = (games ?? []).filter((game) => game.order_number <= 18);
  const matchScore = calculateMatchScore(coreGames);
  const completedCoreGames = (games ?? []).filter(
    (game) => game.order_number <= 18 && Boolean(game.winner_side),
  ).length;
  const isComplete = completedCoreGames === 18;

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

  const { data: currentMatch, error: currentMatchError } = await supabase
    .from("matches")
    .select("id, status, played_at")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single<Pick<MatchRow, "id" | "status" | "played_at">>();

  if (currentMatchError || !currentMatch) {
    return NextResponse.json({ error: currentMatchError?.message ?? "Zapas nebyl nalezen." }, { status: 500 });
  }

  const nextStatus = isComplete ? "awaiting_confirmation" : "scheduled";
  const nextPlayedAt = isComplete ? new Date().toISOString() : null;
  const { error: matchUpdateError } = await supabase
    .from("matches")
    .update({
      status: nextStatus,
      played_at: nextPlayedAt,
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

  if (auditContext && (currentMatch.status !== nextStatus || currentMatch.played_at !== nextPlayedAt)) {
    const auditError = await insertMatchSheetAudit(supabase, {
      matchId,
      entityType: "match",
      entityId: matchId,
      fieldName: "status",
      operation: "status_update",
      oldValue: { status: currentMatch.status, played_at: currentMatch.played_at },
      newValue: { status: nextStatus, played_at: nextPlayedAt },
      context: auditContext,
    });
    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }
  }

  let confirmationsBeforeDeleteQuery = supabase
    .from("match_confirmations")
    .select("id, match_id, side, captain_player_id, confirmed_at")
    .eq("match_id", matchId)
    .is("deleted_at", null);
  if (confirmationSideToDelete) {
    confirmationsBeforeDeleteQuery = confirmationsBeforeDeleteQuery.eq("side", confirmationSideToDelete);
  }
  const { data: confirmationsBeforeDelete, error: confirmationsBeforeDeleteError } = await confirmationsBeforeDeleteQuery;

  if (confirmationsBeforeDeleteError) {
    const schemaResponse = missingSheetSchemaResponse(confirmationsBeforeDeleteError.message);
    return schemaResponse ?? NextResponse.json({ error: confirmationsBeforeDeleteError.message }, { status: 500 });
  }

  let confirmationsDeleteQuery = supabase
    .from("match_confirmations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .is("deleted_at", null);
  if (confirmationSideToDelete) {
    confirmationsDeleteQuery = confirmationsDeleteQuery.eq("side", confirmationSideToDelete);
  }
  const { error: confirmationsDeleteError } = await confirmationsDeleteQuery;

  if (confirmationsDeleteError) {
    const schemaResponse = missingSheetSchemaResponse(confirmationsDeleteError.message);
    return schemaResponse ?? NextResponse.json({ error: confirmationsDeleteError.message }, { status: 500 });
  }

  if (auditContext) {
    for (const confirmation of confirmationsBeforeDelete ?? []) {
      const auditError = await insertMatchSheetAudit(supabase, {
        matchId,
        entityType: "match_confirmation",
        entityId: confirmation.id,
        fieldName: `confirmation:${confirmation.side}`,
        operation: "soft_delete",
        oldValue: confirmation,
        newValue: null,
        context: auditContext,
      });
      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }
    }
  }

  return null;
}

async function handleAutosaveCell(
  request: Request,
  matchId: string,
  cell: AutosaveCell,
) {
  const requestId = createRequestId();
  const preferTeamSide = preferTeamSideForRequest(request);
  const requestUrl = new URL(request.url);
  const requestedTeamSeasonId = parseString(requestUrl.searchParams.get("team_season_id"));
  const access = await authorizeMatchAccess(request, matchId);
  if (access.response) {
    return access.response;
  }

  const supabase = access.supabase;

  if (cell.type === "lineup_reveal") {
    const side = parseSide(cell.side);
    const blockNumber = parseInteger(cell.block_number);
    if (!side || !blockNumber || blockNumber < 1 || blockNumber > maxLineupRevealBlockNumber) {
      return NextResponse.json({ error: "Blok nasazení není platný." }, { status: 400 });
    }

    const [matchResult, membershipsResult] = await Promise.all([
      supabase
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .eq("id", matchId)
        .is("deleted_at", null)
        .single<MatchRow>(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
    ]);

    const lookupError = matchResult.error ?? membershipsResult.error;
    if (lookupError || !matchResult.data) {
      return NextResponse.json(
        { error: lookupError?.message ?? "Zapas nebyl nalezen." },
        { status: 500 },
      );
    }
    if (matchResult.data.status === "confirmed") {
      return lockedConfirmedMatchResponse();
    }

    const forcedTeamSide = preferTeamSide
      ? await forcedTeamSideForRequest(supabase, access.requester, matchResult.data, requestedTeamSeasonId)
      : null;
    const viewer = viewerContextForMatch(access.requester, matchResult.data, membershipsResult.data ?? [], { forcedTeamSide, preferTeamSide });
    if (!viewer.canManageBothSides && !viewer.side) {
      return NextResponse.json({ error: "Nemate opravneni zobrazit nasazeni tohoto zapasu." }, { status: 403 });
    }
    if (!viewer.canManageBothSides && viewer.side !== side) {
      return NextResponse.json({ error: "Nasazeni muze potvrdit jen vlastni strana." }, { status: 403 });
    }

    const { confirmedSides, error: confirmationsLookupError } = await confirmedSidesForMatch(supabase, matchId);
    if (confirmationsLookupError) {
      const schemaResponse = missingSheetSchemaResponse(confirmationsLookupError.message);
      return schemaResponse ?? NextResponse.json({ error: confirmationsLookupError.message }, { status: 500 });
    }
    if (confirmedSides.has(side)) {
      return lockedSideResponse();
    }

    const { data: existingReveal, error: revealLookupError } = await supabase
      .from("match_block_lineup_reveals")
      .select("id")
      .eq("match_id", matchId)
      .eq("side", side)
      .eq("block_number", blockNumber)
      .is("deleted_at", null)
      .maybeSingle();

    if (revealLookupError) {
      const schemaResponse = missingSheetSchemaResponse(revealLookupError.message);
      return schemaResponse ?? NextResponse.json({ error: revealLookupError.message }, { status: 500 });
    }

    if (!existingReveal) {
      const { data: insertedReveal, error: revealInsertError } = await supabase
        .from("match_block_lineup_reveals")
        .insert({
          match_id: matchId,
          side,
          block_number: blockNumber,
          revealed_by_player_id: access.requester?.playerId ?? null,
        })
        .select("id, match_id, side, block_number, revealed_by_player_id, revealed_at")
        .single<MatchBlockLineupRevealRow>();

      if (revealInsertError) {
        const schemaResponse = missingSheetSchemaResponse(revealInsertError.message);
        return schemaResponse ?? NextResponse.json({ error: revealInsertError.message }, { status: 500 });
      }
      const auditContext = auditContextForRequester(access.requester, matchResult.data, viewer, requestId);
      const auditError = await insertMatchSheetAudit(supabase, {
        matchId,
        entityType: "match_block_lineup_reveal",
        entityId: insertedReveal?.id ?? null,
        fieldName: `lineup_reveal:${side}:${blockNumber}`,
        operation: "insert",
        oldValue: null,
        newValue: insertedReveal ?? { side, block_number: blockNumber },
        context: auditContext,
      });
      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, request_id: requestId });
  }

  if (cell.type === "legs") {
    const orderNumber = parseInteger(cell.order_number);
    const hasHomeLegs = hasOwnField(cell, "home_legs");
    const hasAwayLegs = hasOwnField(cell, "away_legs");
    const submittedHomeLegs = hasHomeLegs ? parseInteger(cell.home_legs) : null;
    const submittedAwayLegs = hasAwayLegs ? parseInteger(cell.away_legs) : null;
    const expectedUpdatedAt = parseString(cell.expected_updated_at);

    if (!orderNumber || (!hasHomeLegs && !hasAwayLegs) || (hasHomeLegs && submittedHomeLegs === null) || (hasAwayLegs && submittedAwayLegs === null)) {
      return NextResponse.json({ error: "Zmena legu neni platna." }, { status: 400 });
    }

    const [matchResult, membershipsResult, existingGameResult] = await Promise.all([
      supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, status")
        .eq("id", matchId)
        .is("deleted_at", null)
        .single<MatchRow>(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
      supabase
        .from("match_games")
        .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
        .eq("match_id", matchId)
        .eq("order_number", orderNumber)
        .is("deleted_at", null)
        .maybeSingle<MatchGameRow>(),
    ]);

    const lookupError = matchResult.error ?? membershipsResult.error ?? existingGameResult.error;
    if (lookupError || !matchResult.data) {
      return NextResponse.json(
        { error: lookupError?.message ?? "Zapas nebyl nalezen." },
        { status: 500 },
      );
    }
    if (matchResult.data.status === "confirmed") {
      return lockedConfirmedMatchResponse();
    }
    const existingGame = existingGameResult.data;
    if (!existingGame) {
      return NextResponse.json({ error: "Nejprve ulozte nasazeni hry." }, { status: 400 });
    }
    if (existingGame && expectedUpdatedAt && existingGame.updated_at !== expectedUpdatedAt) {
      return NextResponse.json(
        { error: "Tuto hru mezitim upravil nekdo jiny. Nacitam aktualni zapis." },
        { status: 409 },
      );
    }

    const forcedTeamSide = preferTeamSide
      ? await forcedTeamSideForRequest(supabase, access.requester, matchResult.data, requestedTeamSeasonId)
      : null;
    const viewer = viewerContextForMatch(access.requester, matchResult.data, membershipsResult.data ?? [], { forcedTeamSide, preferTeamSide });
    if (!viewer.canManageBothSides && !viewer.side) {
      return NextResponse.json({ error: "Nemate opravneni upravit zapis tohoto zapasu." }, { status: 403 });
    }
    const { confirmedSides, error: confirmationsLookupError } = await confirmedSidesForMatch(supabase, matchId);
    if (confirmationsLookupError) {
      const schemaResponse = missingSheetSchemaResponse(confirmationsLookupError.message);
      return schemaResponse ?? NextResponse.json({ error: confirmationsLookupError.message }, { status: 500 });
    }
    if (!viewer.canManageBothSides && viewer.side && confirmedSides.has(viewer.side)) {
      return lockedSideResponse();
    }

    const nextHomeLegs = hasHomeLegs ? submittedHomeLegs ?? existingGame.home_legs : existingGame.home_legs;
    const nextAwayLegs = hasAwayLegs ? submittedAwayLegs ?? existingGame.away_legs : existingGame.away_legs;
    const winningLegs = existingGame.game_type === "tiebreak_701" ? 1 : 3;
    if (
      nextHomeLegs > winningLegs ||
      nextAwayLegs > winningLegs ||
      (nextHomeLegs === winningLegs && nextAwayLegs === winningLegs)
    ) {
      return NextResponse.json({ error: "Hra musi mit platny pocet legu." }, { status: 400 });
    }

    const nextWinnerSide = calculateWinner(existingGame.game_type, nextHomeLegs, nextAwayLegs);
    const { data: savedGame, error: saveGameError } = await supabase
      .from("match_games")
      .update({
        home_legs: nextHomeLegs,
        away_legs: nextAwayLegs,
        winner_side: nextWinnerSide,
      })
      .eq("id", existingGame.id)
      .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
      .single<MatchGameRow>();

    if (saveGameError || !savedGame) {
      return NextResponse.json({ error: saveGameError?.message ?? "Hru se nepodarilo ulozit." }, { status: 500 });
    }

    const auditContext = auditContextForRequester(access.requester, matchResult.data, viewer, requestId);
    for (const fieldName of ["home_legs", "away_legs"] as const) {
      const oldValue = existingGame[fieldName];
      const newValue = savedGame[fieldName];
      if (oldValue === newValue) continue;
      const auditError = await insertMatchSheetAudit(supabase, {
        matchId,
        gameId: savedGame.id,
        entityType: "match_game",
        entityId: savedGame.id,
        fieldName,
        operation: "update",
        oldValue,
        newValue,
        context: auditContext,
      });
      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }
    }

    const summaryError = await updateMatchSummary(
      supabase,
      matchId,
      viewer.canManageBothSides ? null : viewer.side,
      auditContext,
    );
    if (summaryError) {
      return summaryError;
    }

    return NextResponse.json({ game: savedGame, request_id: requestId });
  }

  if (cell.type === "player") {
    const orderNumber = parseInteger(cell.order_number);
    const side = parseSide(cell.side);
    const position = parseInteger(cell.position) ?? 1;
    const slotCode = parseString(cell.slot_code);
    const playerId = hasOwnField(cell, "player_id") ? parseString(cell.player_id) : undefined;

    if (!orderNumber || !side || position < 1 || position > 2 || playerId === undefined) {
      return NextResponse.json({ error: "Zmena hrace neni platna." }, { status: 400 });
    }
    if (slotCode && !isSlotForSide(side, slotCode)) {
      return NextResponse.json({ error: "Pozice hrace neni platna." }, { status: 400 });
    }

    const [matchResult, membershipsResult, existingGameResult] = await Promise.all([
      supabase
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .eq("id", matchId)
        .is("deleted_at", null)
        .single<MatchRow>(),
      supabase
        .from("team_memberships")
        .select("team_season_id, player_id, member_role")
        .is("deleted_at", null)
        .is("left_on", null)
        .returns<MembershipRow[]>(),
      supabase
        .from("match_games")
        .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
        .eq("match_id", matchId)
        .eq("order_number", orderNumber)
        .is("deleted_at", null)
        .maybeSingle<MatchGameRow>(),
    ]);

    const lookupError = matchResult.error ?? membershipsResult.error ?? existingGameResult.error;
    if (lookupError || !matchResult.data) {
      return NextResponse.json(
        { error: lookupError?.message ?? "Zapas nebyl nalezen." },
        { status: 500 },
      );
    }
    if (matchResult.data.status === "confirmed") {
      return lockedConfirmedMatchResponse();
    }

    const forcedTeamSide = preferTeamSide
      ? await forcedTeamSideForRequest(supabase, access.requester, matchResult.data, requestedTeamSeasonId)
      : null;
    const viewer = viewerContextForMatch(access.requester, matchResult.data, membershipsResult.data ?? [], { forcedTeamSide, preferTeamSide });
    if (!viewer.canManageBothSides && viewer.side !== side) {
      return NextResponse.json({ error: "Muzete upravit jen vlastni stranu zapisu." }, { status: 403 });
    }
    const { confirmedSides, error: confirmationsLookupError } = await confirmedSidesForMatch(supabase, matchId);
    if (confirmationsLookupError) {
      const schemaResponse = missingSheetSchemaResponse(confirmationsLookupError.message);
      return schemaResponse ?? NextResponse.json({ error: confirmationsLookupError.message }, { status: 500 });
    }
    if (confirmedSides.has(side)) {
      return lockedSideResponse();
    }

    const teamPlayerIds = new Set(
      (membershipsResult.data ?? [])
        .filter((membership) => membership.team_season_id === (side === "home" ? matchResult.data.home_team_id : matchResult.data.away_team_id))
        .map((membership) => membership.player_id),
    );
    if (playerId && !teamPlayerIds.has(playerId)) {
      return NextResponse.json({ error: "Vybrany hrac nepatri do prislusneho tymu." }, { status: 400 });
    }

    let game = existingGameResult.data;
    if (!game) {
      const fixedPair = singlesSlotPairs.get(orderNumber);
      const gameType: MatchGameType =
        fixedPair ? "singles" : orderNumber === 9 ? "doubles" : orderNumber === 10 ? "cricket" : "tiebreak_701";
      const { data: insertedGame, error: insertGameError } = await supabase
        .from("match_games")
        .insert({
          match_id: matchId,
          game_type: gameType,
          order_number: orderNumber,
          home_legs: 0,
          away_legs: 0,
          winner_side: null,
        })
        .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
        .single<MatchGameRow>();
      if (insertGameError || !insertedGame) {
        return NextResponse.json({ error: insertGameError?.message ?? "Hru se nepodarilo zalozit." }, { status: 500 });
      }
      game = insertedGame;
    }

    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from("match_game_players")
      .select("id, match_game_id, side, player_id, position, slot_code")
      .eq("match_game_id", game.id)
      .eq("side", side)
      .eq("position", position)
      .is("deleted_at", null)
      .maybeSingle<MatchGamePlayerRow>();

    if (existingAssignmentError) {
      return NextResponse.json({ error: existingAssignmentError.message }, { status: 500 });
    }

    if (existingAssignment?.player_id === playerId && existingAssignment.slot_code === (slotCode ?? null)) {
      return NextResponse.json({ game, request_id: requestId });
    }

    const playerIdsToLoad = [existingAssignment?.player_id, playerId].filter((value): value is string => Boolean(value));
    const { data: changedPlayers, error: changedPlayersError } = playerIdsToLoad.length > 0
      ? await supabase
          .from("players")
          .select("id, display_name, first_name, last_name")
          .in("id", playerIdsToLoad)
          .returns<PlayerRow[]>()
      : { data: [] as PlayerRow[], error: null };
    if (changedPlayersError) {
      return NextResponse.json({ error: changedPlayersError.message }, { status: 500 });
    }
    const changedPlayerById = new Map((changedPlayers ?? []).map((player) => [player.id, player]));
    const oldSnapshot = {
      side,
      position,
      slot_code: existingAssignment?.slot_code ?? slotCode ?? null,
      player: playerSnapshot(existingAssignment?.player_id ? changedPlayerById.get(existingAssignment.player_id) : null),
    };
    const newSnapshot = {
      side,
      position,
      slot_code: slotCode ?? null,
      player: playerSnapshot(playerId ? changedPlayerById.get(playerId) : null),
    };
    const auditContext = auditContextForRequester(access.requester, matchResult.data, viewer, requestId);
    const { error: savePlayerError } = await supabase.rpc("match_sheet_save_player_assignment", {
      p_match_id: matchId,
      p_order_number: orderNumber,
      p_side: side,
      p_position: position,
      p_slot_code: slotCode,
      p_player_id: playerId,
      p_actor_user_id: auditContext.actorUserId,
      p_actor_player_id: auditContext.actorPlayerId,
      p_actor_role: auditContext.actorRole,
      p_actor_team_season_id: auditContext.actorTeamSeasonId,
      p_source: auditContext.source,
      p_request_id: requestId,
      p_old_value: oldSnapshot,
      p_new_value: newSnapshot,
    });

    if (savePlayerError) {
      return NextResponse.json({ error: savePlayerError.message }, { status: 500 });
    }

    return NextResponse.json({ game, request_id: requestId });
  }

  if (cell.type === "game") {
    return NextResponse.json(
      { error: "Legacy ukladani cele hry je vypnute. Poslete konkretni zmenu pole." },
      { status: 400 },
    );
  }



  if (cell.type === "achievement") {
    const achievement = typeof cell.achievement === "object" && cell.achievement !== null
      ? cell.achievement as SubmittedAchievement
      : {};
    const orderNumber = parseInteger(achievement.order_number);
    const playerId = parseString(achievement.player_id);
    const achievementType = parseString(achievement.achievement_type);
    const achievementCount = parseInteger(achievement.achievement_count) ?? 0;

    if (
      !orderNumber ||
      !playerId ||
      !achievementType ||
      !achievementTypes.includes(achievementType as AchievementType)
    ) {
      return NextResponse.json({ error: "Statistika není platná." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabase
      .from("match_games")
      .select("id, match_id, order_number, game_type, home_legs, away_legs, winner_side, updated_at")
      .eq("match_id", matchId)
      .eq("order_number", orderNumber)
      .is("deleted_at", null)
      .maybeSingle<MatchGameRow>();

    if (gameError || !game) {
      return NextResponse.json(
        { error: gameError?.message ?? "Nejprve uložte hráče pro tuto hru." },
        { status: gameError ? 500 : 400 },
      );
    }

    const { data: matchForAchievement, error: matchForAchievementError } = await supabase
      .from("matches")
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
      .eq("id", matchId)
      .is("deleted_at", null)
      .single<MatchRow>();

    if (matchForAchievementError || !matchForAchievement) {
      return NextResponse.json(
        { error: matchForAchievementError?.message ?? "Zapas nebyl nalezen." },
        { status: 500 },
      );
    }
    if (matchForAchievement.status === "confirmed") {
      return lockedConfirmedMatchResponse();
    }

    if (game.game_type !== "singles") {
      return NextResponse.json({ error: "Statistiky lze zapisovat jen u dvouher." }, { status: 400 });
    }

    const { data: assignedPlayer, error: assignedPlayerError } = await supabase
      .from("match_game_players")
      .select("id, side")
      .eq("match_game_id", game.id)
      .eq("player_id", playerId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; side: MatchSide }>();

    if (assignedPlayerError) {
      return NextResponse.json({ error: assignedPlayerError.message }, { status: 500 });
    }

    if (!assignedPlayer) {
      return NextResponse.json(
        { error: "Vybraný hráč není v této hře nasazený." },
        { status: 400 },
      );
    }

    const { confirmedSides, error: confirmationsLookupError } = await confirmedSidesForMatch(supabase, matchId);
    if (confirmationsLookupError) {
      const schemaResponse = missingSheetSchemaResponse(confirmationsLookupError.message);
      return schemaResponse ?? NextResponse.json({ error: confirmationsLookupError.message }, { status: 500 });
    }
    if (!hasAtLeastRole(access.requester?.role, "moderator") && confirmedSides.has(assignedPlayer.side)) {
      return lockedSideResponse();
    }

    const { data: existingAchievements, error: existingAchievementsError } = await supabase
      .from("match_game_achievements")
      .select("id, match_id, match_game_id, player_id, achievement_type, achievement_count")
      .eq("match_id", matchId)
      .eq("match_game_id", game.id)
      .eq("player_id", playerId)
      .eq("achievement_type", achievementType)
      .is("deleted_at", null)
      .returns<MatchAchievementRow[]>();

    if (existingAchievementsError) {
      return NextResponse.json({ error: existingAchievementsError.message }, { status: 500 });
    }

    if (achievementType === "checkout_100_plus" && achievementCount > 3) {
      return NextResponse.json(
        { error: "Zavření 100+ může mít jeden hráč v zápasu nejvýše 3×." },
        { status: 400 },
      );
    }

    const oldTotal = (existingAchievements ?? []).reduce((sum, item) => sum + item.achievement_count, 0);
    const auditContext = auditContextForRequester(
      access.requester,
      matchForAchievement,
      { side: assignedPlayer.side, canManageBothSides: hasAtLeastRole(access.requester?.role, "moderator") },
      requestId,
    );

    const { error: saveAchievementError } = await supabase.rpc("match_sheet_save_achievement", {
      p_match_id: matchId,
      p_game_id: game.id,
      p_player_id: playerId,
      p_achievement_type: achievementType,
      p_achievement_count: achievementCount,
      p_actor_user_id: auditContext.actorUserId,
      p_actor_player_id: auditContext.actorPlayerId,
      p_actor_role: auditContext.actorRole,
      p_actor_team_season_id: auditContext.actorTeamSeasonId,
      p_source: auditContext.source,
      p_request_id: requestId,
      p_old_value: { player_id: playerId, achievement_type: achievementType, achievement_count: oldTotal },
      p_new_value: { player_id: playerId, achievement_type: achievementType, achievement_count: achievementCount },
    });

    if (saveAchievementError) {
      return NextResponse.json({ error: saveAchievementError.message }, { status: 500 });
    }

    if (oldTotal !== achievementCount) {
      const summaryError = await updateMatchSummary(supabase, matchId, null, auditContext);
      if (summaryError) {
        return summaryError;
      }
    }

    return NextResponse.json({ ok: true, request_id: requestId });
  }

  return NextResponse.json({ error: "Změna zápisu není platná." }, { status: 400 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const preferTeamSide = preferTeamSideForRequest(request);
    const requestUrl = new URL(request.url);
    const teamSeasonId = parseString(requestUrl.searchParams.get("team_season_id"));
    const access = await authorizeMatchAccess(request, id);
    if (access.response) {
      return access.response;
    }

    const { data, error } = await loadSheetData(id, access.requester, { preferTeamSide, teamSeasonId });

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
  const { id: matchId } = await context.params;
  const body = (await request.json().catch(() => null)) as SaveSheetBody | null;
  const cell = typeof body?.cell === "object" && body.cell !== null
    ? body.cell as AutosaveCell
    : null;

  if (cell) {
    return handleAutosaveCell(request, matchId, cell);
  }

  const access = await authorizeMatchAccess(request, matchId);
  if (access.response) {
    return access.response;
  }

  if (access.requester && !hasAtLeastRole(access.requester.role, "moderator")) {
    return NextResponse.json(
      { error: "Kapitánské úpravy zápisu se ukládají průběžně po jednotlivých polích." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: "Hromadne ukladani celeho zapisu je vypnute. Pouzijte konkretni delta zmenu pole." },
    { status: 400 },
  );


}
