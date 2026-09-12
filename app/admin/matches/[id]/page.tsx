"use client";

import { adminFetch } from "@/lib/adminFetch";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui/admin";
import { MatchInfo, MatchSheet, MatchStatisticsSection } from "@/components/matches/MatchSheet";

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
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

type MatchDetail = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: MatchStatus;
};

type NamedEntity = { id: string; name: string };
type TeamSeason = { id: string; team_id: string; display_name: string | null };
type Team = { id: string; name: string; slug?: string; logo_url?: string | null };
type Membership = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
};
type Player = { id: string; display_name: string };
type SheetGame = {
  id: string | null;
  updated_at: string | null;
  game_type: MatchGameType;
  order_number: number;
  home_legs: number;
  away_legs: number;
  winner_side: MatchSide | null;
  home_player_ids: string[];
  away_player_ids: string[];
  home_slot_codes: SlotCode[];
  away_slot_codes: SlotCode[];
};
type MatchPlayerSlot = {
  id?: string;
  match_id?: string;
  side: MatchSide;
  slot_code: SlotCode;
  player_id: string;
};
type SheetAchievement = {
  id?: string;
  match_game_id?: string | null;
  order_number?: number;
  player_id: string;
  achievement_type: AchievementType;
  achievement_count: number;
};
type MatchConfirmation = {
  id: string;
  match_id: string;
  side: MatchSide;
  captain_player_id: string;
  confirmed_at: string;
};
type MatchBlockLineupReveal = {
  id?: string;
  match_id?: string;
  side: MatchSide;
  block_number: number;
  revealed_by_player_id?: string | null;
  revealed_at: string;
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
type Score = { home_points: number; away_points: number; home_legs: number; away_legs: number };
type MatchRescheduleRequest = {
  id: string;
  requested_scheduled_at: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string | null;
  created_at: string;
};
type SheetPayload = {
  match?: MatchDetail;
  season?: NamedEntity;
  league?: NamedEntity;
  group?: NamedEntity;
  teamSeasons?: TeamSeason[];
  teams?: Team[];
  memberships?: Membership[];
  players?: Player[];
  games?: SheetGame[];
  achievements?: SheetAchievement[];
  statistics?: PlayerStatistics[];
  slots?: MatchPlayerSlot[];
  confirmations?: MatchConfirmation[];
  lineupReveals?: MatchBlockLineupReveal[];
  lineupRevealSchemaReady?: boolean;
  viewer?: {
    side: MatchSide | null;
    canManageBothSides: boolean;
  };
  error?: string;
};
type AutosaveResponse = {
  game?: SheetGame;
  error?: string;
};
type RescheduleRequestsPayload = {
  requests?: MatchRescheduleRequest[];
  error?: string;
};
type MatchSheetPageProps = {
  backHref?: string;
  backLabel?: string;
  scoreboardHref?: ((matchId: string) => string) | null;
  teamView?: boolean;
};
const statusLabels: Record<MatchStatus, string> = {
  scheduled: "naplánováno",
  played: "odehráno",
  awaiting_confirmation: "čeká na potvrzení",
  confirmed: "potvrzeno",
  cancelled: "zrušeno",
};
const singlesSlotPairs = new Map<number, [HomeSlotCode, AwaySlotCode]>([
  [1, ["1", "A"]], [2, ["2", "B"]], [3, ["3", "C"]], [4, ["4", "D"]],
  [5, ["1", "B"]], [6, ["2", "C"]], [7, ["3", "D"]], [8, ["4", "A"]],
  [11, ["1", "C"]], [12, ["2", "D"]], [13, ["3", "A"]], [14, ["4", "B"]],
  [15, ["1", "D"]], [16, ["2", "A"]], [17, ["3", "B"]], [18, ["4", "C"]],
]);
const emptyPayload = {
  match: null as MatchDetail | null,
  season: null as NamedEntity | null,
  league: null as NamedEntity | null,
  group: null as NamedEntity | null,
  teamSeasons: [] as TeamSeason[],
  teams: [] as Team[],
  memberships: [] as Membership[],
  players: [] as Player[],
  games: [] as SheetGame[],
  achievements: [] as SheetAchievement[],
  statistics: [] as PlayerStatistics[],
  slots: [] as MatchPlayerSlot[],
  confirmations: [] as MatchConfirmation[],
  lineupReveals: [] as MatchBlockLineupReveal[],
  lineupRevealSchemaReady: true,
  viewer: { side: null as MatchSide | null, canManageBothSides: true },
};
const emptyRescheduleForm = {
  requested_scheduled_at: "",
  reason: "",
};
function getWinner(game: Pick<SheetGame, "game_type" | "home_legs" | "away_legs">): MatchSide | null {
  const winningLegs = game.game_type === "tiebreak_701" ? 1 : 3;
  if (game.home_legs === winningLegs && game.away_legs < winningLegs) return "home";
  if (game.away_legs === winningLegs && game.home_legs < winningLegs) return "away";
  return null;
}

function calculateScore(games: SheetGame[]): Score {
  return games.reduce(
    (score, game) => {
      const winner = getWinner(game);
      if (winner === "home") score.home_points += 1;
      if (winner === "away") score.away_points += 1;
      score.home_legs += game.home_legs;
      score.away_legs += game.away_legs;
      return score;
    },
    { home_points: 0, away_points: 0, home_legs: 0, away_legs: 0 },
  );
}

function matchStatusForGames(games: SheetGame[]): MatchStatus {
  const coreGames = games.filter((game) => game.order_number <= 18);
  const coreScore = calculateScore(coreGames);
  const tiebreakNeeded = coreScore.home_points === 9 && coreScore.away_points === 9;
  const completedCoreGames = coreGames.filter((game) => Boolean(game.winner_side)).length;
  const tiebreak = games.find((game) => game.game_type === "tiebreak_701");
  return completedCoreGames === 18 && (!tiebreakNeeded || Boolean(tiebreak?.winner_side))
    ? "awaiting_confirmation"
    : "scheduled";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function playerLabel(player: Player) {
  return player.display_name;
}

function playerLimitForGame(gameType: MatchGameType) {
  return gameType === "singles" ? 1 : 2;
}

function normalizeGame(game: SheetGame): SheetGame {
  const limit = playerLimitForGame(game.game_type);

  return {
    ...game,
    home_player_ids: game.home_player_ids.slice(0, limit),
    away_player_ids: game.away_player_ids.slice(0, limit),
    home_slot_codes: game.home_slot_codes.slice(0, limit),
    away_slot_codes: game.away_slot_codes.slice(0, limit),
  };
}

export default function AdminMatchSheetPage({
  backHref = "/admin/matches",
  backLabel = "Zpět na zápasy",
  scoreboardHref = (currentMatchId) => `/admin/matches/${currentMatchId}/scoreboard`,
  teamView = false,
}: MatchSheetPageProps = {}) {
  const matchId = useParams<{ id: string }>().id;
  const sheetApiUrl = `/api/admin/matches/${matchId}/sheet${teamView ? "?view=team" : ""}`;
  const [payload, setPayload] = useState(emptyPayload);
  const [rescheduleRequests, setRescheduleRequests] = useState<MatchRescheduleRequest[]>([]);
  const [rescheduleForm, setRescheduleForm] = useState(emptyRescheduleForm);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [revealingLineup, setRevealingLineup] = useState<{ side: MatchSide; blockNumber: number } | null>(null);
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
  const [confirmingSide, setConfirmingSide] = useState<MatchSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleNotice, setRescheduleNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const autosaveRequestId = useRef(0);
  const didAutoOpenRescheduleForm = useRef(false);

  const playerById = useMemo(() => new Map(payload.players.map((player) => [player.id, player])), [payload.players]);
  const teamById = useMemo(() => new Map(payload.teams.map((team) => [team.id, team])), [payload.teams]);
  const teamSeasonById = useMemo(() => new Map(payload.teamSeasons.map((team) => [team.id, team])), [payload.teamSeasons]);
  const homeTeamSeason = payload.match ? teamSeasonById.get(payload.match.home_team_id) : undefined;
  const awayTeamSeason = payload.match ? teamSeasonById.get(payload.match.away_team_id) : undefined;
  const homeTeamName = homeTeamSeason?.display_name || (homeTeamSeason ? teamById.get(homeTeamSeason.team_id)?.name : null) || "Domácí";
  const awayTeamName = awayTeamSeason?.display_name || (awayTeamSeason ? teamById.get(awayTeamSeason.team_id)?.name : null) || "Hosté";
  const homeTeamLogoUrl = homeTeamSeason ? teamById.get(homeTeamSeason.team_id)?.logo_url ?? null : null;
  const awayTeamLogoUrl = awayTeamSeason ? teamById.get(awayTeamSeason.team_id)?.logo_url ?? null : null;
  const homePlayers = payload.memberships
    .filter((membership) => membership.team_season_id === payload.match?.home_team_id)
    .map((membership) => playerById.get(membership.player_id))
    .filter((player): player is Player => Boolean(player));
  const awayPlayers = payload.memberships
    .filter((membership) => membership.team_season_id === payload.match?.away_team_id)
    .map((membership) => playerById.get(membership.player_id))
    .filter((player): player is Player => Boolean(player));
  const coreGames = payload.games.filter((game) => game.order_number <= 18);
  const coreScore = calculateScore(coreGames);
  const tiebreakNeeded =
    coreScore.home_points === 9 && coreScore.away_points === 9;
  const totalScore = calculateScore(
    payload.games.filter((game) => game.order_number <= 18 || tiebreakNeeded),
  );
  const confirmationBySide = new Map(
    payload.confirmations.map((confirmation) => [confirmation.side, confirmation]),
  );
  const pendingRescheduleRequest = rescheduleRequests.find((request) => request.status === "pending");
  const captainForSide = (side: MatchSide) => {
    const teamSeasonId = side === "home" ? payload.match?.home_team_id : payload.match?.away_team_id;
    const membership = payload.memberships.find(
      (item) => item.team_season_id === teamSeasonId && item.member_role === "captain",
    );
    return membership ? playerById.get(membership.player_id) : undefined;
  };

  async function loadRescheduleRequests() {
    const response = await adminFetch(`/api/admin/match-reschedule-requests?match_id=${matchId}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as RescheduleRequestsPayload;
    if (!response.ok) {
      throw new Error(body.error ?? "Žádosti o změnu termínu se nepodařilo načíst.");
    }
    const requests = body.requests ?? [];
    setRescheduleRequests(requests);
    return requests;
  }

  async function loadSheet() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminFetch(sheetApiUrl);
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Zápis utkání se nepodařilo načíst.");
      const slots = body.slots ?? [];
      const games = (body.games ?? []).map(normalizeGame);
      setPayload({
        match: body.match ?? null,
        season: body.season ?? null,
        league: body.league ?? null,
        group: body.group ?? null,
        teamSeasons: body.teamSeasons ?? [],
        teams: body.teams ?? [],
        memberships: body.memberships ?? [],
        players: body.players ?? [],
        games,
        achievements: (body.achievements ?? []).map((achievement) => ({
          ...achievement,
          order_number: games.find((game) => game.id === achievement.match_game_id)?.order_number ?? 1,
        })),
        statistics: body.statistics ?? [],
        slots,
        confirmations: body.confirmations ?? [],
        lineupReveals: body.lineupReveals ?? [],
        lineupRevealSchemaReady: body.lineupRevealSchemaReady ?? false,
        viewer: body.viewer ?? { side: null, canManageBothSides: true },
      });
      const loadedRequests = await loadRescheduleRequests().catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Žádosti o změnu termínu se nepodařilo načíst.");
        return null;
      });
      if (
        new URLSearchParams(window.location.search).get("reschedule") === "1" &&
        body.match &&
        loadedRequests &&
        !didAutoOpenRescheduleForm.current &&
        !loadedRequests.some((request) => request.status === "pending")
      ) {
        setRescheduleForm({
          requested_scheduled_at: dateTimeLocalValue(body.match.scheduled_at),
          reason: "",
        });
        setIsRescheduleFormOpen(true);
        didAutoOpenRescheduleForm.current = true;
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Zápis utkání se nepodařilo načíst.");
    }
    setIsLoading(false);
  }

  async function handleRescheduleRequest() {
    if (!payload.match) return;
    const requestedScheduledAt = new Date(rescheduleForm.requested_scheduled_at);
    if (Number.isNaN(requestedScheduledAt.getTime())) {
      setRescheduleNotice({ type: "error", text: "Vyberte platný nový termín." });
      return;
    }

    setIsSubmittingReschedule(true);
    setError(null);
    setRescheduleNotice({ type: "info", text: "Odesílám žádost o změnu termínu..." });

    try {
      const response = await adminFetch("/api/admin/match-reschedule-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: payload.match.id,
          requested_scheduled_at: requestedScheduledAt.toISOString(),
          reason: rescheduleForm.reason,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as RescheduleRequestsPayload;
      if (!response.ok) throw new Error(body.error ?? "Žádost o změnu termínu se nepodařilo odeslat.");
      setRescheduleForm(emptyRescheduleForm);
      setIsRescheduleFormOpen(false);
      await loadRescheduleRequests();
      setRescheduleNotice({ type: "success", text: "Žádost byla odeslána. Teď čeká na schválení moderátorem." });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Žádost o změnu termínu se nepodařilo odeslat.";
      setError(message);
      setRescheduleNotice({ type: "error", text: message });
    } finally {
      setIsSubmittingReschedule(false);
    }
  }

  function openRescheduleForm() {
    setRescheduleForm({
      requested_scheduled_at: payload.match ? dateTimeLocalValue(payload.match.scheduled_at) : "",
      reason: "",
    });
    setIsRescheduleFormOpen(true);
  }

  async function handleConfirm(side: MatchSide) {
    setConfirmingSide(side);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/matches/${matchId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Potvrzení zápisu se nepodařilo uložit.");
      await loadSheet();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Potvrzení zápisu se nepodařilo uložit.");
    }
    setConfirmingSide(null);
  }

  async function handleRevealLineup(side: MatchSide, blockNumber: number) {
    setRevealingLineup({ side, blockNumber });
    setError(null);

    try {
      const response = await adminFetch(sheetApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cell: {
            type: "lineup_reveal",
            side,
            block_number: blockNumber,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) {
        throw new Error(body.error ?? "Nasazení se nepodařilo zobrazit soupeři.");
      }
      await loadSheet();
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Nasazení se nepodařilo zobrazit soupeři.");
    } finally {
      setRevealingLineup(null);
    }
  }

  useEffect(() => {
    // Initial data is loaded when the dynamic match route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  function updateGame(orderNumber: number, changes: Partial<SheetGame>) {
    setPayload((current) => ({
      ...current,
      games: current.games.map((game) => (
        game.order_number === orderNumber ? normalizeGame({ ...game, ...changes }) : game
      )),
    }));
  }

  async function saveGameCell(game: SheetGame) {
    const requestId = autosaveRequestId.current + 1;
    autosaveRequestId.current = requestId;
    setIsAutosaving(true);
    setError(null);

    try {
      const response = await adminFetch(sheetApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cell: {
            type: "game",
            expected_updated_at: game.updated_at,
            game,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as AutosaveResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Změnu zápisu se nepodařilo uložit.");
      }

      if (body.game) {
        setPayload((current) => {
          const games = current.games.map((currentGame) => (
            currentGame.order_number === body.game?.order_number
              ? normalizeGame({
                  ...currentGame,
                  ...body.game,
                  id: body.game.id,
                  updated_at: body.game.updated_at,
                  winner_side: body.game.winner_side,
                })
              : currentGame
          ));
          return {
            ...current,
            confirmations: [],
            games,
            match: current.match
              ? { ...current.match, status: matchStatusForGames(games) }
              : current.match,
          };
        });
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Změnu zápisu se nepodařilo uložit.");
      await loadSheet();
    } finally {
      if (autosaveRequestId.current === requestId) {
        setIsAutosaving(false);
      }
    }
  }

  async function saveAchievementCell(
    orderNumber: number,
    playerId: string,
    type: AchievementType,
    count: number,
  ) {
    const requestId = autosaveRequestId.current + 1;
    autosaveRequestId.current = requestId;
    setIsAutosaving(true);
    setError(null);

    try {
      const response = await adminFetch(sheetApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cell: {
            type: "achievement",
            achievement: {
              order_number: orderNumber,
              player_id: playerId,
              achievement_type: type,
              achievement_count: count,
            },
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as AutosaveResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Statistiku se nepodařilo uložit.");
      }
      setPayload((current) => ({ ...current, confirmations: [] }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Statistiku se nepodařilo uložit.");
      await loadSheet();
    } finally {
      if (autosaveRequestId.current === requestId) {
        setIsAutosaving(false);
      }
    }
  }

  function updateLegs(game: SheetGame, side: "home_legs" | "away_legs", value: number) {
    const maximumLegs = game.game_type === "tiebreak_701" ? 1 : 3;
    const normalizedValue = Math.min(maximumLegs, Math.max(0, value));
    const otherSide = side === "home_legs" ? "away_legs" : "home_legs";
    const otherValue =
      normalizedValue > 0 && normalizedValue < maximumLegs
        ? maximumLegs
        : normalizedValue === maximumLegs && game[otherSide] === maximumLegs
          ? 0
          : game[otherSide];
    const winnerSide = getWinner({
      ...game,
      [side]: normalizedValue,
      [otherSide]: otherValue,
    });
    const updated = {
      ...game,
      [side]: normalizedValue,
      [otherSide]: otherValue,
      winner_side: winnerSide,
    };
    updateGame(game.order_number, {
      [side]: normalizedValue,
      [otherSide]: otherValue,
      winner_side: winnerSide,
    });
    void saveGameCell(normalizeGame(updated));
  }

  function firstBlockSuggestion(side: MatchSide, slotCode: SlotCode) {
    const game = payload.games.find((item) => {
      const pair = singlesSlotPairs.get(item.order_number);
      if (!pair || item.order_number > 4) return false;
      return side === "home" ? pair[0] === slotCode : pair[1] === slotCode;
    });
    return side === "home" ? game?.home_player_ids[0] ?? "" : game?.away_player_ids[0] ?? "";
  }

  function slotCodesForGame(game: SheetGame, side: MatchSide) {
    const fixedPair = singlesSlotPairs.get(game.order_number);
    if (fixedPair) {
      return side === "home" ? fixedPair.slice(0, 1) : fixedPair.slice(1, 2);
    }

    return side === "home" ? game.home_slot_codes : game.away_slot_codes;
  }

  function playerUsesDifferentSlot(side: MatchSide, slotCode: SlotCode, playerId: string) {
    if (!playerId) return false;
    return payload.games.some((game) => {
      if (game.game_type !== "singles") return false;
      const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
      return playerIds.some(
        (rowPlayerId, index) =>
          rowPlayerId === playerId && slotCodesForGame(game, side)[index] !== slotCode,
      );
    });
  }

  function prefillRowPlayer(game: SheetGame, side: MatchSide, index: number) {
    if (game.game_type !== "singles") return;
    if (game.order_number <= 4) return;
    const slotCode = slotCodesForGame(game, side)[index];
    const key = side === "home" ? "home_player_ids" : "away_player_ids";
    if (!slotCode || game[key][index]) return;
    const suggestedPlayerId = firstBlockSuggestion(side, slotCode);
    if (!suggestedPlayerId) return;
    const playerIds = [...game[key]];
    playerIds[index] = suggestedPlayerId;
    updateGame(game.order_number, { [key]: playerIds } as Partial<SheetGame>);
    void saveGameCell(normalizeGame({ ...game, [key]: playerIds }));
  }

  function updateRowPlayer(game: SheetGame, side: MatchSide, index: number, playerId: string) {
    const fixedPair = singlesSlotPairs.get(game.order_number);
    const slotCode = fixedPair ? slotCodesForGame(game, side)[index] : null;
    if (slotCode && playerUsesDifferentSlot(side, slotCode, playerId)) {
      setError("Tento hráč už je nasazený na jiné pozici.");
      return;
    }

    const key = side === "home" ? "home_player_ids" : "away_player_ids";
    const playerIds = [...game[key]];
    const previousPlayerId = playerIds[index] ?? "";
    playerIds[index] = playerId;
    if (previousPlayerId && previousPlayerId !== playerId) {
      removePlayerAchievements(game.order_number, previousPlayerId);
    }
    updateGame(game.order_number, { [key]: playerIds } as Partial<SheetGame>);
    void saveGameCell(normalizeGame({ ...game, [key]: playerIds }));
  }

  function removePlayerAchievements(orderNumber: number, playerId: string) {
    if (!playerId) return;
    setPayload((current) => ({
      ...current,
      achievements: current.achievements.filter(
        (achievement) =>
          achievement.order_number !== orderNumber || achievement.player_id !== playerId,
      ),
    }));
  }

  function updateInlineAchievement(
    orderNumber: number,
    playerId: string,
    type: AchievementType,
    count: number,
  ) {
    if (!playerId) return;
    const normalizedCount = Math.max(0, count);
    if (type === "checkout_100_plus") {
      const otherCheckouts = payload.achievements
        .filter(
          (achievement) =>
            achievement.player_id === playerId &&
            achievement.achievement_type === type &&
            achievement.order_number !== orderNumber,
        )
        .reduce((sum, achievement) => sum + achievement.achievement_count, 0);
      if (otherCheckouts + normalizedCount > 3) {
        setError("Zavření 100+ může mít jeden hráč v zápasu nejvýše 3x.");
        return;
      }
    }

    setError(null);
    setPayload((current) => {
      const achievements = current.achievements.filter(
        (achievement) =>
          achievement.order_number !== orderNumber ||
          achievement.player_id !== playerId ||
          achievement.achievement_type !== type,
      );
      return {
        ...current,
        achievements: normalizedCount > 0
          ? [...achievements, { order_number: orderNumber, player_id: playerId, achievement_type: type, achievement_count: normalizedCount }]
          : achievements,
      };
    });
    void saveAchievementCell(orderNumber, playerId, type, normalizedCount);
  }

  if (isLoading) return <Card><p className="text-sm text-[var(--admin-muted)]">Načítám zápis utkání...</p></Card>;
  if (!payload.match) return <Card><p className="text-sm text-red-700">{error ?? "Zápas nebyl nalezen."}</p></Card>;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm font-semibold text-[var(--brand-blue)] hover:text-[var(--brand-navy)]" href={backHref}>{backLabel}</Link>
          <div className="mt-4"><PageHeader title="Zápis utkání" description="Oficiální zápis ZŠS podle jednotlivých bloků utkání." /></div>
        </div>
        {scoreboardHref ? (
          <Link
            className="inline-flex w-fit items-center justify-center rounded-2xl bg-[#EF233C] px-5 py-3 text-sm font-bold !text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
            href={scoreboardHref(matchId)}
          >
            Otevřít počítadlo
          </Link>
        ) : null}
      </div>
      <Card>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MatchInfo label="Domácí">{homeTeamName}</MatchInfo><MatchInfo label="Hosté">{awayTeamName}</MatchInfo>
          <MatchInfo label="Soutěž">{payload.season?.name} / {payload.league?.name} / {payload.group?.name}</MatchInfo>
          <MatchInfo label="Datum a stav">{formatDateTime(payload.match.scheduled_at)} <Badge>{statusLabels[payload.match.status]}</Badge></MatchInfo>
        </div>
        <div className="mt-6 grid gap-4 border-t border-[var(--admin-border)] pt-5 sm:grid-cols-2">
          <MatchInfo label="Výsledek zápasu"><span className="text-3xl">{totalScore.home_points}:{totalScore.away_points}</span></MatchInfo>
          <MatchInfo label="Skóre legů"><span className="text-3xl">{totalScore.home_legs}:{totalScore.away_legs}</span></MatchInfo>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[var(--brand-navy)]">Termín zápasu</h3>
            <p className="mt-1 text-sm font-semibold text-[var(--admin-muted)]">
              Aktuální termín: {formatDateTime(payload.match.scheduled_at)}
            </p>
            {pendingRescheduleRequest ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Čeká žádost o změnu na {formatDateTime(pendingRescheduleRequest.requested_scheduled_at)}.
              </p>
            ) : null}
          </div>
          <Button
            disabled={Boolean(pendingRescheduleRequest)}
            onClick={openRescheduleForm}
            type="button"
            variant="secondary"
          >
            Změnit termín
          </Button>
        </div>
        {rescheduleNotice ? (
          <p
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
              rescheduleNotice.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : rescheduleNotice.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {rescheduleNotice.text}
          </p>
        ) : null}

        {isRescheduleFormOpen ? (
          <div className="mt-5 grid gap-4 border-t border-[var(--admin-border)] pt-5">
            <label className="flex flex-col gap-1 text-sm font-bold text-[var(--brand-navy)]">
              Nový termín
              <input
                className="rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-blue)]"
                min={dateTimeLocalValue(new Date().toISOString())}
                required
                type="datetime-local"
                value={rescheduleForm.requested_scheduled_at}
                onChange={(event) => setRescheduleForm((current) => ({ ...current, requested_scheduled_at: event.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold text-[var(--brand-navy)]">
              Důvod
              <textarea
                className="min-h-24 rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-blue)]"
                required
                value={rescheduleForm.reason}
                onChange={(event) => setRescheduleForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!rescheduleForm.requested_scheduled_at || !rescheduleForm.reason.trim()}
                isLoading={isSubmittingReschedule}
                onClick={() => void handleRescheduleRequest()}
                type="button"
              >
                {isSubmittingReschedule ? "Odesílám..." : "Odeslat žádost"}
              </Button>
              <Button
                disabled={isSubmittingReschedule}
                onClick={() => setIsRescheduleFormOpen(false)}
                type="button"
                variant="secondary"
              >
                Zrušit
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      {error ? <Card><p className="text-sm text-red-700">{error}</p></Card> : null}
      <div className="flex flex-col gap-6">
        <MatchSheet
          achievements={payload.achievements}
          awayPlayers={awayPlayers}
          awayTeamLogoUrl={awayTeamLogoUrl}
          blockReveals={payload.lineupReveals}
          canManageBothSides={payload.viewer.canManageBothSides}
          games={payload.games}
          homePlayers={homePlayers}
          homeTeamLogoUrl={homeTeamLogoUrl}
          isRevealSaving={revealingLineup !== null}
          lineupRevealSchemaReady={payload.lineupRevealSchemaReady}
          onAchievementChange={updateInlineAchievement}
          onLegsChange={updateLegs}
          onPlayerChange={updateRowPlayer}
          onPlayerFocus={prefillRowPlayer}
          onRevealLineup={handleRevealLineup}
          playerUsesDifferentSlot={playerUsesDifferentSlot}
          viewerSide={payload.viewer.side}
        />
        {isAutosaving ? <div className="flex justify-end"><Badge>Ukládám...</Badge></div> : null}
        <Card>
          <h3 className="text-lg font-bold text-[var(--brand-navy)]">Potvrzení kapitány</h3>
          <p className="mt-2 text-sm text-[var(--admin-muted)]">
            Po dokončení zápisu musí výsledek potvrdit kapitán domácího i hostujícího týmu.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {(["home", "away"] as const).map((side) => {
              const confirmation = confirmationBySide.get(side);
              const captain = captainForSide(side);
              return (
                <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-soft-blue)] p-4" key={side}>
                  <p className="text-xs font-semibold text-[var(--admin-muted)]">{side === "home" ? "Domácí" : "Hosté"}</p>
                  <p className="mt-1 font-bold text-[var(--brand-navy)]">{side === "home" ? homeTeamName : awayTeamName}</p>
                  <p className="mt-2 text-sm text-[var(--admin-muted)]">
                    Kapitán: {captain ? playerLabel(captain) : "není nastavený"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--brand-navy)]">
                    {confirmation ? `Potvrzeno ${formatDateTime(confirmation.confirmed_at)}` : "Čeká na potvrzení"}
                  </p>
                  {!confirmation ? (
                    <div className="mt-4">
                      <Button
                        disabled={payload.match?.status !== "awaiting_confirmation" || confirmingSide !== null}
                        onClick={() => void handleConfirm(side)}
                        type="button"
                      >
                        {confirmingSide === side ? "Potvrzuji..." : "Potvrdit zápis"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-bold text-[var(--brand-navy)]">Statistiky</h3>
          <p className="mt-2 text-sm text-[var(--admin-muted)]">Herní statistiky se počítají pouze z dvouher. Výkony jsou evidované u jednotlivých dílčích her.</p>
          <MatchStatisticsSection
            achievements={payload.achievements}
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
            statistics={payload.statistics}
          />
        </Card>
      </div>
    </div>
  );
}

function dateTimeLocalValue(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
