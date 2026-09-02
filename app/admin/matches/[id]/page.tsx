"use client";

import { adminFetch } from "@/lib/adminFetch";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
type Team = { id: string; name: string };
type Membership = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
};
type Player = { id: string; display_name: string };
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
};
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
      const response = await adminFetch(`/api/admin/matches/${matchId}/sheet`);
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
      const response = await adminFetch(`/api/admin/matches/${matchId}/sheet`, {
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

  if (isLoading) return <Card><p className="text-sm text-[var(--admin-muted)]">Načítám zápis utkání...</p></Card>;
  if (!payload.match) return <Card><p className="text-sm text-red-700">{error ?? "Zápas nebyl nalezen."}</p></Card>;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm font-semibold text-[var(--brand-blue)] hover:text-[var(--brand-navy)]" href="/admin/matches">Zpět na zápasy</Link>
          <div className="mt-4"><PageHeader title="Zápis utkání" description="Oficiální zápis ZŠS podle jednotlivých bloků utkání." /></div>
        </div>
        <Link
          className="inline-flex w-fit items-center justify-center rounded-2xl bg-[#EF233C] px-5 py-3 text-sm font-bold !text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
          href={`/admin/matches/${matchId}/scoreboard`}
        >
          Otevřít počítadlo
        </Link>
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
      {error ? <Card><p className="text-sm text-red-700">{error}</p></Card> : null}
      <form className="flex flex-col gap-6" onSubmit={handleSave}>
        <MatchSheet
          achievements={payload.achievements}
          awayPlayers={awayPlayers}
          games={payload.games}
          homePlayers={homePlayers}
          onAchievementChange={updateInlineAchievement}
          onLegsChange={updateLegs}
          onPairSlotChange={updatePairGameSlot}
          onPlayerChange={updateRowPlayer}
          onPlayerFocus={prefillRowPlayer}
          playerUsesDifferentSlot={playerUsesDifferentSlot}
        />
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
          <MatchStatisticsSection
            achievements={payload.achievements}
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
            statistics={payload.statistics}
          />
        </Card>
      </form>
    </div>
  );
}
