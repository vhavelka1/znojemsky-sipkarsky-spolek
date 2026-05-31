"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui/admin";

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
type Team = { id: string; name: string };
type Membership = { team_season_id: string; player_id: string; member_role: "player" | "captain" };
type Player = { id: string; display_name: string; nickname: string | null };
type SheetGame = {
  id: string | null;
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
  error?: string;
};
type Block = {
  title: string;
  subtitle: string;
  orders: number[];
  highlighted?: boolean;
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: "naplánováno",
  played: "odehráno",
  awaiting_confirmation: "čeká na potvrzení",
  confirmed: "potvrzeno",
  cancelled: "zrušeno",
};
const gameTypeLabels: Record<MatchGameType, string> = {
  singles: "Dvouhra",
  doubles: "Čtyřhra",
  cricket: "Kriket",
  tiebreak_701: "Rozstřel 701 DO",
};
const achievementLabels: Record<AchievementType, string> = {
  score_95_plus: "95+",
  score_133_plus: "133+",
  score_171_plus: "171+",
  checkout_100_plus: "Zavření 100+",
};
const achievementTypes = Object.keys(achievementLabels) as AchievementType[];
const paperAchievementTypes: AchievementType[] = [
  "score_171_plus",
  "score_133_plus",
  "score_95_plus",
  "checkout_100_plus",
];
const homeSlotCodes: HomeSlotCode[] = ["1", "2", "3", "4"];
const awaySlotCodes: AwaySlotCode[] = ["A", "B", "C", "D"];
const singlesSlotPairs = new Map<number, [HomeSlotCode, AwaySlotCode]>([
  [1, ["1", "A"]], [2, ["2", "B"]], [3, ["3", "C"]], [4, ["4", "D"]],
  [5, ["1", "B"]], [6, ["2", "C"]], [7, ["3", "D"]], [8, ["4", "A"]],
  [11, ["1", "C"]], [12, ["2", "D"]], [13, ["3", "A"]], [14, ["4", "B"]],
  [15, ["1", "D"]], [16, ["2", "A"]], [17, ["3", "B"]], [18, ["4", "C"]],
]);
const blocks: Block[] = [
  { title: "Blok 1", subtitle: "První dvouhry", orders: [1, 2, 3, 4] },
  { title: "Blok 2", subtitle: "Druhé dvouhry", orders: [5, 6, 7, 8] },
  { title: "Blok 3", subtitle: "Párové hry", orders: [9, 10], highlighted: true },
  { title: "Blok 4", subtitle: "Třetí dvouhry", orders: [11, 12, 13, 14] },
  { title: "Blok 5", subtitle: "Čtvrté dvouhry", orders: [15, 16, 17, 18] },
];
const tiebreakBlock: Block = {
  title: "Povinně při stavu 9:9",
  subtitle: "Rozstřel 701 DO",
  orders: [19],
  highlighted: true,
};
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
};
const inputClass =
  "rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

function getWinner(game: Pick<SheetGame, "game_type" | "home_legs" | "away_legs">) {
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function playerLabel(player: Player) {
  return player.nickname ? `${player.display_name} (${player.nickname})` : player.display_name;
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--brand-navy)]">{children}</p>
    </div>
  );
}

export default function AdminMatchSheetPage() {
  const matchId = useParams<{ id: string }>().id;
  const [payload, setPayload] = useState(emptyPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingSide, setConfirmingSide] = useState<MatchSide | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(payload.players.map((player) => [player.id, player])), [payload.players]);
  const teamById = useMemo(() => new Map(payload.teams.map((team) => [team.id, team])), [payload.teams]);
  const teamSeasonById = useMemo(() => new Map(payload.teamSeasons.map((team) => [team.id, team])), [payload.teamSeasons]);
  const homeTeamSeason = payload.match ? teamSeasonById.get(payload.match.home_team_id) : undefined;
  const awayTeamSeason = payload.match ? teamSeasonById.get(payload.match.away_team_id) : undefined;
  const homeTeamName = homeTeamSeason?.display_name || (homeTeamSeason ? teamById.get(homeTeamSeason.team_id)?.name : null) || "Domácí";
  const awayTeamName = awayTeamSeason?.display_name || (awayTeamSeason ? teamById.get(awayTeamSeason.team_id)?.name : null) || "Hosté";
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
  const captainForSide = (side: MatchSide) => {
    const teamSeasonId = side === "home" ? payload.match?.home_team_id : payload.match?.away_team_id;
    const membership = payload.memberships.find(
      (item) => item.team_season_id === teamSeasonId && item.member_role === "captain",
    );
    return membership ? playerById.get(membership.player_id) : undefined;
  };

  async function loadSheet() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/matches/${matchId}/sheet`);
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Zápis utkání se nepodařilo načíst.");
      const slots = body.slots ?? [];
      const games = body.games ?? [];
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
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Zápis utkání se nepodařilo načíst.");
    }
    setIsLoading(false);
  }

  async function handleConfirm(side: MatchSide) {
    setConfirmingSide(side);
    setError(null);
    try {
      const response = await fetch(`/api/admin/matches/${matchId}/confirm`, {
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

  useEffect(() => {
    // Initial data is loaded when the dynamic match route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  function updateGame(orderNumber: number, changes: Partial<SheetGame>) {
    setPayload((current) => ({
      ...current,
      games: current.games.map((game) => game.order_number === orderNumber ? { ...game, ...changes } : game),
    }));
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
    const updated = {
      ...game,
      [side]: normalizedValue,
      [otherSide]: otherValue,
      winner_side: null,
    };
    updateGame(game.order_number, {
      [side]: normalizedValue,
      [otherSide]: otherValue,
      winner_side: getWinner(updated),
    });
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
      const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
      return playerIds.some(
        (rowPlayerId, index) =>
          rowPlayerId === playerId && slotCodesForGame(game, side)[index] !== slotCode,
      );
    });
  }

  function prefillRowPlayer(game: SheetGame, side: MatchSide, index: number) {
    if (game.order_number <= 4) return;
    const slotCode = slotCodesForGame(game, side)[index];
    const key = side === "home" ? "home_player_ids" : "away_player_ids";
    if (!slotCode || game[key][index]) return;
    const suggestedPlayerId = firstBlockSuggestion(side, slotCode);
    if (!suggestedPlayerId) return;
    const playerIds = [...game[key]];
    playerIds[index] = suggestedPlayerId;
    updateGame(game.order_number, { [key]: playerIds } as Partial<SheetGame>);
  }

  function updateRowPlayer(game: SheetGame, side: MatchSide, index: number, playerId: string) {
    const slotCode = slotCodesForGame(game, side)[index];
    if (!slotCode) {
      setError("Nejprve vyberte pozici hráče.");
      return;
    }
    if (playerUsesDifferentSlot(side, slotCode, playerId)) {
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
  }

  function updatePairGameSlot(
    game: SheetGame,
    side: MatchSide,
    index: number,
    slotCode: string,
  ) {
    const key = side === "home" ? "home_slot_codes" : "away_slot_codes";
    const slotCodes = [...game[key]];
    if (slotCode && slotCodes.some((value, itemIndex) => value === slotCode && itemIndex !== index)) {
      setError(`Pozice ${slotCode} už je v této hře vybraná.`);
      return;
    }
    slotCodes[index] = slotCode as SlotCode;
    const playerKey = side === "home" ? "home_player_ids" : "away_player_ids";
    const playerIds = [...game[playerKey]];
    playerIds[index] = slotCode ? firstBlockSuggestion(side, slotCode as SlotCode) : "";
    setError(null);
    updateGame(game.order_number, {
      [key]: slotCodes,
      [playerKey]: playerIds,
    } as Partial<SheetGame>);
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

  function achievementCount(orderNumber: number, playerId: string, type: AchievementType) {
    return payload.achievements.find(
      (achievement) =>
        achievement.order_number === orderNumber &&
        achievement.player_id === playerId &&
        achievement.achievement_type === type,
    )?.achievement_count ?? 0;
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
        setError("Zavření 100+ může mít jeden hráč v zápasu nejvýše 3×.");
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
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const games = payload.games.filter((game) => game.order_number <= 18 || tiebreakNeeded);
      const achievements = payload.achievements.filter((achievement) => (achievement.order_number ?? 0) <= 18);
      const slots = games
        .filter((game) => game.order_number <= 4)
        .flatMap((game) => {
          const pair = singlesSlotPairs.get(game.order_number);
          if (!pair) return [];
          return [
            game.home_player_ids[0]
              ? { side: "home" as const, slot_code: pair[0], player_id: game.home_player_ids[0] }
              : null,
            game.away_player_ids[0]
              ? { side: "away" as const, slot_code: pair[1], player_id: game.away_player_ids[0] }
              : null,
          ].filter((slot) => Boolean(slot));
        });
      const response = await fetch(`/api/admin/matches/${matchId}/sheet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games, achievements, slots }),
      });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Zápis utkání se nepodařilo uložit.");
      await loadSheet();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Zápis utkání se nepodařilo uložit.");
    }
    setIsSaving(false);
  }

  function renderAchievementCell(game: SheetGame, side: MatchSide, type: AchievementType) {
    if (game.game_type !== "singles") {
      return <span className="block text-center text-[var(--admin-muted)]">-</span>;
    }

    const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
    return (
      <div className="grid gap-2">
        {[playerIds[0] ?? ""].map((playerId, index) => (
          <input
            aria-label={`${achievementLabels[type]} ${side === "home" ? "domácí" : "hosté"} ${index + 1}`}
            className="h-8 w-8 rounded-md border border-[var(--admin-border)] bg-white px-0.5 text-center text-xs outline-none focus:border-[var(--brand-blue)] disabled:bg-slate-50"
            disabled={!playerId}
            inputMode="numeric"
            key={`${side}:${type}:${index}`}
            pattern="[0-9]*"
            type="text"
            value={playerId ? achievementCount(game.order_number, playerId, type) : 0}
            onChange={(event) =>
              updateInlineAchievement(
                game.order_number,
                playerId,
                type,
                Number(event.target.value.replace(/[^0-9]/g, "") || 0),
              )
            }
          />
        ))}
      </div>
    );
  }

  function renderGame(game: SheetGame) {
    const pairGame = game.game_type !== "singles";
    const fixedPair = singlesSlotPairs.get(game.order_number);
    const maximumLegs = game.game_type === "tiebreak_701" ? 1 : 3;
    const legsPattern = game.game_type === "tiebreak_701" ? "[0-1]" : "[0-3]";

    function renderAssignedPlayer(side: MatchSide, slotCode: SlotCode) {
      const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
      const players = side === "home" ? homePlayers : awayPlayers;
      return (
        <div className="grid grid-cols-[22px_1fr] items-center gap-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[var(--admin-soft-blue)] px-1 text-[11px] font-bold text-[var(--brand-navy)]">
            {slotCode}
          </span>
          <select
            className={`${inputClass} min-w-0 px-2 py-1.5 text-xs`}
            value={playerIds[0] ?? ""}
            onFocus={() => prefillRowPlayer(game, side, 0)}
            onChange={(event) => updateRowPlayer(game, side, 0, event.target.value)}
          >
            <option value="">Vyberte hráče</option>
            {players
              .filter((player) => player.id === playerIds[0] || !playerUsesDifferentSlot(side, slotCode, player.id))
              .map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}
          </select>
        </div>
      );
    }

    function renderPairSlots(side: MatchSide) {
      const slotCodes = side === "home" ? homeSlotCodes : awaySlotCodes;
      const selectedCodes = side === "home" ? game.home_slot_codes : game.away_slot_codes;
      return (
        <div className="grid gap-2">
          {[0, 1].map((index) => {
            const selectedCode = selectedCodes[index] ?? "";
            const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
            const players = side === "home" ? homePlayers : awayPlayers;
            return (
              <div className="grid gap-1" key={index}>
                <select
                  className={`${inputClass} min-w-0 px-1 py-1 text-[11px]`}
                  value={selectedCode}
                  onChange={(event) => updatePairGameSlot(game, side, index, event.target.value)}
                >
                  <option value="">Vyberte pozici</option>
                  {slotCodes.map((slotCode) => (
                    <option key={slotCode} value={slotCode}>Pozice {slotCode}</option>
                  ))}
                </select>
                <select
                  className={`${inputClass} min-w-0 px-1 py-1 text-[11px]`}
                  value={playerIds[index] ?? ""}
                  onFocus={() => prefillRowPlayer(game, side, index)}
                  onChange={(event) => updateRowPlayer(game, side, index, event.target.value)}
                >
                  <option value="">Vyberte hráče</option>
                  {players
                    .filter((player) => player.id === playerIds[index] || !selectedCode || !playerUsesDifferentSlot(side, selectedCode, player.id))
                    .map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <tr className="border-t border-[var(--admin-border)]" key={game.order_number}>
        <td className="px-1 py-3 text-center text-xs font-bold text-[var(--brand-navy)]">
          {fixedPair
            ? `${game.order_number}.`
            : `${game.order_number}. ${gameTypeLabels[game.game_type]}`}
        </td>
        {paperAchievementTypes.map((type) => (
          <td className="px-0.5 py-2" key={`home:${type}`}>{renderAchievementCell(game, "home", type)}</td>
        ))}
        <td className="px-1 py-3">
          {pairGame
            ? renderPairSlots("home")
            : fixedPair ? renderAssignedPlayer("home", fixedPair[0]) : null}
        </td>
        <td className="px-1 py-3 text-center text-[11px] font-bold text-[var(--brand-blue)]">
          {fixedPair ? `${fixedPair[0]}:${fixedPair[1]}` : gameTypeLabels[game.game_type]}
        </td>
        <td className="px-1 py-3">
          {pairGame
            ? renderPairSlots("away")
            : fixedPair ? renderAssignedPlayer("away", fixedPair[1]) : null}
        </td>
        {paperAchievementTypes.map((type) => (
          <td className="px-0.5 py-2" key={`away:${type}`}>{renderAchievementCell(game, "away", type)}</td>
        ))}
        <td className="px-1 py-3">
          <div className="grid grid-cols-[46px_8px_46px] items-center justify-center gap-0.5">
            <input className={`${inputClass} h-8 w-full px-1 py-0 text-center text-sm font-semibold`} inputMode="numeric" maxLength={1} pattern={legsPattern} type="text" value={game.home_legs} onChange={(event) => updateLegs(game, "home_legs", Number(event.target.value.replace(maximumLegs === 1 ? /[^0-1]/g : /[^0-3]/g, "") || 0))} />
            <span className="text-center">:</span>
            <input className={`${inputClass} h-8 w-full px-1 py-0 text-center text-sm font-semibold`} inputMode="numeric" maxLength={1} pattern={legsPattern} type="text" value={game.away_legs} onChange={(event) => updateLegs(game, "away_legs", Number(event.target.value.replace(maximumLegs === 1 ? /[^0-1]/g : /[^0-3]/g, "") || 0))} />
          </div>
        </td>
        <td className="px-1 py-3 text-center text-xs font-bold text-[var(--brand-navy)]">
          {getWinner(game) === "home" ? "1:0" : getWinner(game) === "away" ? "0:1" : "-"}
        </td>
      </tr>
    );
  }

  function renderBlock(block: Block) {
    const games = payload.games.filter((game) => block.orders.includes(game.order_number));
    const score = calculateScore(payload.games.filter((game) => game.order_number <= Math.max(...block.orders)));
    return (
      <Card className={`overflow-hidden p-0 ${block.highlighted ? "border-[#E2C57A] bg-[#fffdf7]" : ""}`}>
        <div className={`flex flex-col gap-3 border-b border-[var(--admin-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${block.highlighted ? "bg-[#fbf6e8]" : "bg-white"}`}>
          <div><p className="text-xs font-bold text-[var(--brand-blue)]">{block.title}</p><h3 className="mt-1 text-lg font-bold text-[var(--brand-navy)]">{block.subtitle}</h3></div>
          <div className="flex gap-5 text-sm">
            <span><strong>Průběžný stav:</strong> {score.home_points}:{score.away_points}</span>
            <span><strong>Legy:</strong> {score.home_legs}:{score.away_legs}</span>
          </div>
        </div>
        <div className="overflow-x-visible">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-[var(--admin-soft-blue)] text-[var(--admin-muted)]">
              <tr>
                <th className="w-14 px-1 py-2 text-center">Zápas</th>
                {paperAchievementTypes.map((type) => <th className="w-9 px-0.5 py-2 text-center text-[10px]" key={`home:${type}`}><span className="inline-block [writing-mode:vertical-rl] rotate-180">{achievementLabels[type]}</span></th>)}
                <th className="w-48 px-1 py-2 text-center">Domácí</th>
                <th className="w-12 px-1 py-2 text-center">Pozice</th>
                <th className="w-48 px-1 py-2 text-center">Hosté</th>
                {paperAchievementTypes.map((type) => <th className="w-9 px-0.5 py-2 text-center text-[10px]" key={`away:${type}`}><span className="inline-block [writing-mode:vertical-rl] rotate-180">{achievementLabels[type]}</span></th>)}
                <th className="w-28 px-1 py-2 text-center">Legy</th>
                <th className="w-12 px-1 py-2 text-center">Body</th>
              </tr>
            </thead>
            <tbody>{games.map(renderGame)}</tbody>
          </table>
        </div>
      </Card>
    );
  }

  function statisticRows(players: Player[]) {
    return players.map((player) => {
      const statistic = payload.statistics.find((item) => item.player_id === player.id) ?? { played_matches: 0, won_matches: 0, lost_matches: 0, played_legs: 0, won_legs: 0, lost_legs: 0 };
      const totals = achievementTypes.map((type) => payload.achievements.filter((item) => item.player_id === player.id && item.achievement_type === type).reduce((sum, item) => sum + item.achievement_count, 0));
      return <tr className="border-t border-[var(--admin-border)]" key={player.id}><td className="px-3 py-3 font-medium">{playerLabel(player)}</td><td className="px-3 py-3 text-right">{statistic.played_matches}</td><td className="px-3 py-3 text-right">{statistic.won_matches}</td><td className="px-3 py-3 text-right">{statistic.lost_matches}</td><td className="px-3 py-3 text-right">{statistic.played_legs}</td><td className="px-3 py-3 text-right">{statistic.won_legs}</td><td className="px-3 py-3 text-right">{statistic.lost_legs}</td>{totals.map((total, index) => <td className="px-3 py-3 text-right" key={achievementTypes[index]}>{total}</td>)}</tr>;
    });
  }

  function statisticsTable(title: string, players: Player[]) {
    return <div><h4 className="font-bold text-[var(--brand-navy)]">{title}</h4><div className="mt-3 overflow-x-auto"><table className="min-w-[900px] text-left text-sm"><thead className="bg-[var(--admin-soft-blue)] text-[var(--admin-muted)]"><tr><th className="px-3 py-3">Hráč</th>{["OZ", "VZ", "PZ", "OL", "VL", "PL", "95+", "133+", "171+", "Zavření 100+"].map((label) => <th className="px-3 py-3 text-right" key={label}>{label}</th>)}</tr></thead><tbody>{statisticRows(players)}</tbody></table></div></div>;
  }

  if (isLoading) return <Card><p className="text-sm text-[var(--admin-muted)]">Načítám zápis utkání...</p></Card>;
  if (!payload.match) return <Card><p className="text-sm text-red-700">{error ?? "Zápas nebyl nalezen."}</p></Card>;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link className="text-sm font-semibold text-[var(--brand-blue)] hover:text-[var(--brand-navy)]" href="/admin/matches">Zpět na zápasy</Link>
        <div className="mt-4"><PageHeader title="Zápis utkání" description="Oficiální zápis ZŠS podle jednotlivých bloků utkání." /></div>
      </div>
      <Card>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Domácí">{homeTeamName}</Info><Info label="Hosté">{awayTeamName}</Info>
          <Info label="Soutěž">{payload.season?.name} / {payload.league?.name} / {payload.group?.name}</Info>
          <Info label="Datum a stav">{formatDateTime(payload.match.scheduled_at)} <Badge>{statusLabels[payload.match.status]}</Badge></Info>
        </div>
        <div className="mt-6 grid gap-4 border-t border-[var(--admin-border)] pt-5 sm:grid-cols-2">
          <Info label="Výsledek zápasu"><span className="text-3xl">{totalScore.home_points}:{totalScore.away_points}</span></Info>
          <Info label="Skóre legů"><span className="text-3xl">{totalScore.home_legs}:{totalScore.away_legs}</span></Info>
        </div>
      </Card>
      {error ? <Card><p className="text-sm text-red-700">{error}</p></Card> : null}
      <form className="flex flex-col gap-6" onSubmit={handleSave}>
        {blocks.map((block) => <div key={block.title}>{renderBlock(block)}</div>)}
        {tiebreakNeeded ? <div>{renderBlock(tiebreakBlock)}</div> : null}
        <div className="flex justify-end"><Button disabled={isSaving} type="submit">{isSaving ? "Ukládám..." : "Uložit zápis"}</Button></div>
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
          <div className="mt-5 grid gap-7">{statisticsTable("Domácí hráči", homePlayers)}{statisticsTable("Hostující hráči", awayPlayers)}</div>
        </Card>
      </form>
    </div>
  );
}
