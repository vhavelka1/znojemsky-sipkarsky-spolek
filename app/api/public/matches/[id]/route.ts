import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MatchGameType = "singles" | "doubles" | "cricket" | "tiebreak_701";
type MatchSide = "home" | "away";
type HomeSlotCode = "1" | "2" | "3" | "4";
type AwaySlotCode = "A" | "B" | "C" | "D";
type SlotCode = HomeSlotCode | AwaySlotCode;
type AchievementType = "score_95_plus" | "score_133_plus" | "score_171_plus" | "checkout_100_plus";

type MatchRow = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  round_number: number | string | null;
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
};

type MatchGamePlayerRow = {
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

type MatchResultRow = {
  match_id: string;
  home_points: number;
  away_points: number;
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

const singlesSlotPairs = new Map<number, [HomeSlotCode, AwaySlotCode]>([
  [1, ["1", "A"]], [2, ["2", "B"]], [3, ["3", "C"]], [4, ["4", "D"]],
  [5, ["1", "B"]], [6, ["2", "C"]], [7, ["3", "D"]], [8, ["4", "A"]],
  [11, ["1", "C"]], [12, ["2", "D"]], [13, ["3", "A"]], [14, ["4", "B"]],
  [15, ["1", "D"]], [16, ["2", "A"]], [17, ["3", "B"]], [18, ["4", "C"]],
]);

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
  if (gameType === "single") return "singles";
  if (gameType === "tiebreak") return "tiebreak_701";
  return ["singles", "doubles", "cricket", "tiebreak_701"].includes(gameType) ? gameType as MatchGameType : "singles";
}

function calculateWinner(game: Pick<MatchGameRow, "game_type" | "home_legs" | "away_legs">) {
  const winningLegs = game.game_type === "tiebreak_701" ? 1 : 3;
  if (game.home_legs === winningLegs && game.away_legs < winningLegs) return "home";
  if (game.away_legs === winningLegs && game.home_legs < winningLegs) return "away";
  return null;
}

function calculateMatchScore(games: Array<Pick<MatchGameRow, "game_type" | "home_legs" | "away_legs">>) {
  return games.reduce(
    (score, game) => {
      const winner = calculateWinner(game);
      if (winner === "home") score.home_points += 1;
      if (winner === "away") score.away_points += 1;
      score.home_legs += game.home_legs;
      score.away_legs += game.away_legs;
      return score;
    },
    { home_points: 0, away_points: 0, home_legs: 0, away_legs: 0 },
  );
}

function buildStatistics(games: MatchGameRow[], gamePlayers: MatchGamePlayerRow[]): PlayerStatistics[] {
  const gameById = new Map(games.map((game) => [game.id, game]));
  const statistics = new Map<string, PlayerStatistics>();

  gamePlayers.forEach((gamePlayer) => {
    const game = gameById.get(gamePlayer.match_game_id);
    if (!game || !game.winner_side || game.game_type !== "singles") return;

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
    if (game.winner_side === gamePlayer.side) current.won_matches += 1;
    else current.lost_matches += 1;
    statistics.set(gamePlayer.player_id, current);
  });

  return Array.from(statistics.values());
}

function roundValue(value: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function isMissingOptionalTeamColumn(message: string) {
  return message.includes("logo_url");
}

function missingSheetSchemaResponse(errorMessage: string) {
  if (
    errorMessage.includes("public.match_games") ||
    errorMessage.includes("public.match_game_players") ||
    errorMessage.includes("public.match_game_achievements") ||
    errorMessage.includes("schema cache")
  ) {
    return NextResponse.json(
      { error: "Tabulky pro zápis utkání zatím nejsou vytvořené." },
      { status: 500 },
    );
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at, played_at, status")
      .eq("id", id)
      .is("deleted_at", null)
      .single<MatchRow>();

    if (matchError || !match) {
      return NextResponse.json({ error: matchError?.message ?? "Zápas nebyl nalezen." }, { status: 404 });
    }

    const [season, league, group, teamSeasons, teamsWithOptionalColumns, memberships, players, games, gamePlayers, achievements, result] =
      await Promise.all([
        supabase.from("seasons").select("id, name").eq("id", match.season_id).is("deleted_at", null).single(),
        supabase.from("leagues").select("id, name").eq("id", match.league_id).is("deleted_at", null).single(),
        supabase.from("league_groups").select("id, name").eq("id", match.group_id).is("deleted_at", null).single(),
        supabase.from("team_seasons").select("id, team_id, season_id, display_name").in("id", [match.home_team_id, match.away_team_id]).is("deleted_at", null).returns<TeamSeasonRow[]>(),
        supabase.from("teams").select("id, name, slug, logo_url").is("deleted_at", null).returns<TeamRow[]>(),
        supabase.from("team_memberships").select("team_season_id, player_id, member_role").in("team_season_id", [match.home_team_id, match.away_team_id]).is("deleted_at", null).is("left_on", null).returns<MembershipRow[]>(),
        supabase.from("players").select("id, display_name").is("deleted_at", null).order("display_name", { ascending: true }).returns<PlayerRow[]>(),
        supabase.from("match_games").select("id, match_id, game_type, order_number, home_legs, away_legs, winner_side").eq("match_id", id).is("deleted_at", null).order("order_number", { ascending: true }).returns<MatchGameRow[]>(),
        supabase.from("match_game_players").select("match_game_id, side, player_id, position, slot_code").is("deleted_at", null).returns<MatchGamePlayerRow[]>(),
        supabase.from("match_game_achievements").select("id, match_id, match_game_id, player_id, achievement_type, achievement_count").eq("match_id", id).is("deleted_at", null).returns<MatchAchievementRow[]>(),
        supabase.from("match_results").select("match_id, home_points, away_points").eq("match_id", id).is("deleted_at", null).maybeSingle<MatchResultRow>(),
      ]);

    const error =
      season.error ??
      league.error ??
      group.error ??
      teamSeasons.error ??
      (
        teamsWithOptionalColumns.error?.message && isMissingOptionalTeamColumn(teamsWithOptionalColumns.error.message)
          ? null
          : teamsWithOptionalColumns.error
      ) ??
      memberships.error ??
      players.error ??
      games.error ??
      gamePlayers.error ??
      achievements.error ??
      result.error;

    if (error) {
      return missingSheetSchemaResponse(error.message) ?? NextResponse.json({ error: error.message }, { status: 500 });
    }

    let teamRows = teamsWithOptionalColumns.data;
    if (teamsWithOptionalColumns.error?.message && isMissingOptionalTeamColumn(teamsWithOptionalColumns.error.message)) {
      const fallback = await supabase
        .from("teams")
        .select("id, name, slug")
        .is("deleted_at", null)
        .returns<TeamRow[]>();

      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }

      teamRows = fallback.data;
    }

    const activeGameIds = new Set((games.data ?? []).map((game) => game.id));
    const relevantGamePlayers = (gamePlayers.data ?? []).filter((gamePlayer) => activeGameIds.has(gamePlayer.match_game_id));
    const playersByGame = new Map<string, MatchGamePlayerRow[]>();
    relevantGamePlayers.forEach((gamePlayer) => {
      playersByGame.set(gamePlayer.match_game_id, [...(playersByGame.get(gamePlayer.match_game_id) ?? []), gamePlayer]);
    });

    const gamesByOrder = new Map((games.data ?? []).map((game) => [game.order_number, game]));
    const sheetGames = getDefaultGames().map((defaultGame) => {
      const savedGame = gamesByOrder.get(defaultGame.order_number);
      if (!savedGame) return defaultGame;

      const assignedPlayers = playersByGame.get(savedGame.id) ?? [];
      const gameType = normalizeGameType(savedGame.game_type);
      const fixedPair = singlesSlotPairs.get(savedGame.order_number);
      const homeSlotCodes = fixedPair
        ? fixedPair.slice(0, 1)
        : assignedPlayers.filter((player) => player.side === "home").sort((a, b) => a.position - b.position).map((player) => player.slot_code).filter((slotCode): slotCode is SlotCode => Boolean(slotCode));
      const awaySlotCodes = fixedPair
        ? fixedPair.slice(1, 2)
        : assignedPlayers.filter((player) => player.side === "away").sort((a, b) => a.position - b.position).map((player) => player.slot_code).filter((slotCode): slotCode is SlotCode => Boolean(slotCode));
      const playerIdsForSide = (side: MatchSide, slotCodes: SlotCode[]) => {
        const sidePlayers = assignedPlayers.filter((player) => player.side === side);
        const positions = Math.min(playerLimitForGame(gameType), Math.max(slotCodes.length, sidePlayers.length));
        return Array.from({ length: positions }, (_, index) => sidePlayers.find((player) => player.position === index + 1)?.player_id ?? "");
      };

      return {
        id: savedGame.id,
        game_type: gameType,
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
    const achievementRows = (achievements.data ?? []).map((achievement) => ({
      ...achievement,
      order_number: sheetGames.find((game) => game.id === achievement.match_game_id)?.order_number ?? 1,
    }));
    const teamRowsWithLogos = (teamRows ?? []).map((team) => ({ ...team, logo_url: teamLogoUrl(team.slug, team.logo_url) }));

    return NextResponse.json({
      match: { ...match, round_number: roundValue(match.round_number) },
      season: season.data,
      league: league.data,
      group: group.data,
      teamSeasons: teamSeasons.data ?? [],
      teams: teamRowsWithLogos,
      memberships: memberships.data ?? [],
      players: players.data ?? [],
      games: sheetGames,
      achievements: achievementRows,
      result: result.data,
      matchScore: calculateMatchScore(sheetGames),
      statistics: buildStatistics(games.data ?? [], relevantGamePlayers),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Zápis utkání se nepodařilo načíst." },
      { status: 500 },
    );
  }
}
