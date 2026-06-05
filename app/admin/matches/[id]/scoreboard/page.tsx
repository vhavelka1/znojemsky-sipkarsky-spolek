"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCheckout, isValidDoubleOutFinish } from "@/lib/dartsCheckout";
import type { MultiplierName } from "@/lib/dartsCheckout";

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
type MatchGameType = "singles" | "doubles" | "cricket" | "tiebreak_701";
type MatchSide = "home" | "away";
type SlotCode = "1" | "2" | "3" | "4" | "A" | "B" | "C" | "D";
type AchievementType =
  | "score_95_plus"
  | "score_133_plus"
  | "score_171_plus"
  | "checkout_100_plus";
type ScoringMode = "501" | "701" | "cricket";
type Multiplier = 1 | 2 | 3;

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
type SheetAchievement = {
  id?: string;
  match_game_id?: string | null;
  order_number?: number;
  player_id: string;
  achievement_type: AchievementType;
  achievement_count: number;
};
type MatchPlayerSlot = {
  side: MatchSide;
  slot_code: SlotCode;
  player_id: string;
};
type SheetPayload = {
  match?: MatchDetail;
  season?: NamedEntity;
  league?: NamedEntity;
  group?: NamedEntity;
  teamSeasons?: TeamSeason[];
  teams?: Team[];
  players?: Player[];
  games?: SheetGame[];
  achievements?: SheetAchievement[];
  slots?: MatchPlayerSlot[];
  error?: string;
};
type SideState = {
  score: number;
  legs: number;
  totalScored: number;
  dartsThrown: number;
  visits: number[];
};
type ScoreboardState = {
  sides: Record<MatchSide, SideState>;
  activeSide: MatchSide;
  startingSide: MatchSide;
  turnStartScore: number;
  currentThrows: DartThrow[];
  lastVisits: VisitHistory[];
  gameFinished: boolean;
  isSaved: boolean;
  legWinnerSide: MatchSide | null;
};
type DartThrow = {
  value: number;
  multiplier: Multiplier;
  score: number;
  label: string;
};
type VisitHistory = {
  side: MatchSide;
  score: number;
  text: string;
  bust?: boolean;
};
type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};
type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
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
const sideLabels: Record<MatchSide, string> = {
  home: "Domácí",
  away: "Hosté",
};
const multiplierLabels: Record<Multiplier, MultiplierName> = {
  1: "single",
  2: "double",
  3: "triple",
};
const keypadValues = Array.from({ length: 20 }, (_, index) => index + 1).concat(25);
const emptyPayload = {
  match: null as MatchDetail | null,
  season: null as NamedEntity | null,
  league: null as NamedEntity | null,
  group: null as NamedEntity | null,
  teamSeasons: [] as TeamSeason[],
  teams: [] as Team[],
  players: [] as Player[],
  games: [] as SheetGame[],
  achievements: [] as SheetAchievement[],
  slots: [] as MatchPlayerSlot[],
};

function nextSide(side: MatchSide): MatchSide {
  return side === "home" ? "away" : "home";
}

function baseScore(mode: ScoringMode) {
  return mode === "701" ? 701 : 501;
}

function winningLegsForGame(game: SheetGame | null) {
  return game?.game_type === "tiebreak_701" ? 1 : 3;
}

function modeForGame(game: SheetGame | null): ScoringMode {
  if (!game) return "501";
  if (game.game_type === "tiebreak_701") return "701";
  if (game.game_type === "cricket") return "cricket";
  return "501";
}

function getWinner(gameType: MatchGameType, homeLegs: number, awayLegs: number) {
  const requiredLegs = gameType === "tiebreak_701" ? 1 : 3;
  if (homeLegs === requiredLegs && awayLegs < requiredLegs) return "home";
  if (awayLegs === requiredLegs && homeLegs < requiredLegs) return "away";
  return null;
}

function calculateCoreScore(games: SheetGame[]) {
  return games
    .filter((game) => game.order_number <= 18)
    .reduce(
      (score, game) => {
        const winner = getWinner(game.game_type, game.home_legs, game.away_legs);
        if (winner === "home") score.home += 1;
        if (winner === "away") score.away += 1;
        return score;
      },
      { home: 0, away: 0 },
    );
}

function playerLabel(player: Player) {
  return player.display_name;
}

function throwLabel(value: number, multiplier: Multiplier) {
  if (value === 0) return "MISS";
  if (value === 25 && multiplier === 2) return "Bull";
  if (multiplier === 2) return `D${value}`;
  if (multiplier === 3) return `T${value}`;
  return String(value);
}

function throwScore(value: number, multiplier: Multiplier) {
  if (value === 25 && multiplier === 2) return 50;
  return value * multiplier;
}

function visitScore(throwsForTurn: DartThrow[]) {
  return throwsForTurn.reduce((sum, dart) => sum + dart.score, 0);
}

function average(side: SideState) {
  if (side.dartsThrown === 0) return "0.00";
  return ((side.totalScored / side.dartsThrown) * 3).toFixed(2);
}

function createInitialState(mode: ScoringMode, game: SheetGame | null): ScoreboardState {
  const start = baseScore(mode);
  return {
    sides: {
      home: {
        score: start,
        legs: game?.home_legs ?? 0,
        totalScored: 0,
        dartsThrown: 0,
        visits: [],
      },
      away: {
        score: start,
        legs: game?.away_legs ?? 0,
        totalScored: 0,
        dartsThrown: 0,
        visits: [],
      },
    },
    activeSide: "home",
    startingSide: "home",
    turnStartScore: start,
    currentThrows: [],
    lastVisits: [],
    gameFinished: Boolean(game?.winner_side),
    isSaved: Boolean(game?.winner_side),
    legWinnerSide: null,
  };
}

function addVisit(history: VisitHistory[], item: VisitHistory) {
  return [item, ...history].slice(0, 10);
}

function updateVisitSide(
  state: ScoreboardState,
  side: MatchSide,
  scored: number,
  dartsThrown: number,
  score?: number,
) {
  const currentSide = state.sides[side];
  return {
    ...state.sides,
    [side]: {
      ...currentSide,
      score: score ?? currentSide.score,
      totalScored: currentSide.totalScored + scored,
      dartsThrown: currentSide.dartsThrown + dartsThrown,
      visits: [scored, ...currentSide.visits].slice(0, 8),
    },
  };
}

export default function MatchScoreboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const [payload, setPayload] = useState(emptyPayload);
  const [selectedOrder, setSelectedOrder] = useState(1);
  const [mode, setMode] = useState<ScoringMode>("501");
  const [scoreboard, setScoreboard] = useState(() => createInitialState("501", null));
  const [multiplier, setMultiplier] = useState<Multiplier>(1);
  const [dartSnapshots, setDartSnapshots] = useState<ScoreboardState[]>([]);
  const [visitSnapshots, setVisitSnapshots] = useState<ScoreboardState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] = useState("Režim bdění není zapnutý.");
  const [error, setError] = useState<string | null>(null);

  const loadSheet = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/matches/${matchId}/sheet`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Zápis utkání se nepodařilo načíst.");

      const nextPayload = {
        ...emptyPayload,
        ...body,
        match: body.match ?? null,
        season: body.season ?? null,
        league: body.league ?? null,
        group: body.group ?? null,
        teamSeasons: body.teamSeasons ?? [],
        teams: body.teams ?? [],
        players: body.players ?? [],
        games: body.games ?? [],
        achievements: body.achievements ?? [],
        slots: body.slots ?? [],
      };
      setPayload(nextPayload);

      const firstGame = nextPayload.games.find((game) => game.game_type !== "cricket");
      if (firstGame) {
        setSelectedOrder(firstGame.order_number);
        const nextMode = modeForGame(firstGame);
        setMode(nextMode);
        setScoreboard(createInitialState(nextMode, firstGame));
        setDartSnapshots([]);
        setVisitSnapshots([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Zápis utkání se nepodařilo načíst.");
    }

    setIsLoading(false);
  }, [matchId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSheet(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSheet]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const releaseListener = () => setWakeLockStatus("Režim bdění byl ukončen.");

    async function requestWakeLock() {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock) {
        setWakeLockStatus("Wake Lock API není v tomto prohlížeči podporované.");
        return;
      }

      try {
        sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinel.addEventListener("release", releaseListener);
        setWakeLockStatus("Tablet zůstane při skórování vzhůru.");
      } catch {
        setWakeLockStatus("Režim bdění se nepodařilo zapnout.");
      }
    }

    void requestWakeLock();

    return () => {
      cancelled = true;
      if (sentinel && !sentinel.released) {
        sentinel.removeEventListener("release", releaseListener);
        void sentinel.release();
      }
    };
  }, []);

  const teamById = useMemo(() => new Map(payload.teams.map((team) => [team.id, team])), [payload.teams]);
  const teamSeasonById = useMemo(
    () => new Map(payload.teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])),
    [payload.teamSeasons],
  );
  const playerById = useMemo(
    () => new Map(payload.players.map((player) => [player.id, player])),
    [payload.players],
  );
  const selectedGame = useMemo(
    () => payload.games.find((game) => game.order_number === selectedOrder) ?? null,
    [payload.games, selectedOrder],
  );
  const coreScore = useMemo(() => calculateCoreScore(payload.games), [payload.games]);
  const tiebreakAvailable = coreScore.home === 9 && coreScore.away === 9;
  const gameOptions = useMemo(
    () =>
      payload.games.filter(
        (game) =>
          game.order_number <= 18 || (game.order_number === 19 && tiebreakAvailable),
      ),
    [payload.games, tiebreakAvailable],
  );

  const homeTeamName = useMemo(() => {
    if (!payload.match) return "Domácí";
    const teamSeason = teamSeasonById.get(payload.match.home_team_id);
    return teamSeason?.display_name || (teamSeason ? teamById.get(teamSeason.team_id)?.name : null) || "Domácí";
  }, [payload.match, teamById, teamSeasonById]);

  const awayTeamName = useMemo(() => {
    if (!payload.match) return "Hosté";
    const teamSeason = teamSeasonById.get(payload.match.away_team_id);
    return teamSeason?.display_name || (teamSeason ? teamById.get(teamSeason.team_id)?.name : null) || "Hosté";
  }, [payload.match, teamById, teamSeasonById]);

  const winningLegs = winningLegsForGame(selectedGame);
  const isCricket = mode === "cricket" || selectedGame?.game_type === "cricket";
  const activeScore = scoreboard.sides[scoreboard.activeSide].score;
  const checkout = !isCricket && activeScore <= 170 ? getCheckout(activeScore) : null;
  const currentThrowText =
    scoreboard.currentThrows.length > 0
      ? scoreboard.currentThrows.map((item) => item.label).join(" + ")
      : "čeká se na první šipku";

  const gameSideNames = useCallback(
    (side: MatchSide) => {
      const playerIds = side === "home" ? selectedGame?.home_player_ids : selectedGame?.away_player_ids;
      const fallback = side === "home" ? homeTeamName : awayTeamName;
      const names = (playerIds ?? [])
        .filter(Boolean)
        .map((playerId) => {
          const player = playerById.get(playerId);
          return player ? playerLabel(player) : "Nevybraný hráč";
        });
      return names.length > 0 ? names.join(" / ") : fallback;
    },
    [awayTeamName, homeTeamName, playerById, selectedGame],
  );

  function resetForGame(game: SheetGame | null) {
    const nextMode = modeForGame(game);
    setMode(nextMode);
    setScoreboard(createInitialState(nextMode, game));
    setMultiplier(1);
    setDartSnapshots([]);
    setVisitSnapshots([]);
    setError(null);
  }

  function handleGameChange(orderNumber: number) {
    const game = payload.games.find((item) => item.order_number === orderNumber) ?? null;
    setSelectedOrder(orderNumber);
    resetForGame(game);
  }

  async function requestFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    await document.documentElement.requestFullscreen().catch(() => undefined);
  }

  async function saveGame(state: ScoreboardState = scoreboard) {
    if (!selectedGame) return;

    setIsSaving(true);
    setError(null);

    try {
      const updatedGame: SheetGame = {
        ...selectedGame,
        home_legs: state.sides.home.legs,
        away_legs: state.sides.away.legs,
        winner_side: getWinner(
          selectedGame.game_type,
          state.sides.home.legs,
          state.sides.away.legs,
        ),
      };
      const updatedGames = payload.games
        .map((game) => (game.order_number === selectedGame.order_number ? updatedGame : game))
        .filter((game) => game.order_number <= 18 || (game.order_number === 19 && tiebreakAvailable));
      const achievements = payload.achievements.filter(
        (achievement) => (achievement.order_number ?? 0) <= 18,
      );
      const response = await fetch(`/api/admin/matches/${matchId}/sheet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          games: updatedGames,
          achievements,
          slots: payload.slots,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Hru se nepodařilo uložit.");

      setPayload((current) => ({
        ...current,
        ...body,
        match: body.match ?? current.match,
        season: body.season ?? current.season,
        league: body.league ?? current.league,
        group: body.group ?? current.group,
        teamSeasons: body.teamSeasons ?? current.teamSeasons,
        teams: body.teams ?? current.teams,
        players: body.players ?? current.players,
        games: body.games ?? current.games,
        achievements: body.achievements ?? current.achievements,
        slots: body.slots ?? current.slots,
      }));
      setScoreboard((current) => ({ ...current, isSaved: true }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Hru se nepodařilo uložit.");
    }

    setIsSaving(false);
  }

  function switchPlayer(state: ScoreboardState, history: VisitHistory[]) {
    const otherSide = nextSide(state.activeSide);
    return {
      ...state,
      activeSide: otherSide,
      turnStartScore: state.sides[otherSide].score,
      currentThrows: [],
      lastVisits: history,
      legWinnerSide: null,
    };
  }

  function finishVisit(state: ScoreboardState, throwsForTurn: DartThrow[]) {
    if (throwsForTurn.length === 0) return state;
    const scored = visitScore(throwsForTurn);
    const nextState = {
      ...state,
      sides: updateVisitSide(state, state.activeSide, scored, throwsForTurn.length),
      isSaved: false,
    };
    const history = addVisit(nextState.lastVisits, {
      side: state.activeSide,
      score: scored,
      text: `${gameSideNames(state.activeSide)}: ${scored}`,
    });
    return switchPlayer(nextState, history);
  }

  function handleBust(state: ScoreboardState, throwsForTurn: DartThrow[]) {
    const nextState = {
      ...state,
      sides: updateVisitSide(state, state.activeSide, 0, throwsForTurn.length, state.turnStartScore),
      isSaved: false,
    };
    const history = addVisit(nextState.lastVisits, {
      side: state.activeSide,
      score: 0,
      text: `${gameSideNames(state.activeSide)}: přehoz`,
      bust: true,
    });
    return switchPlayer(nextState, history);
  }

  function handleLegWin(state: ScoreboardState, throwsForTurn: DartThrow[]) {
    const scored = visitScore(throwsForTurn);
    const nextLegs = state.sides[state.activeSide].legs + 1;
    const wonGame = nextLegs >= winningLegs;
    const nextStarter = nextSide(state.startingSide);
    const start = baseScore(mode);
    const updatedSides = updateVisitSide(state, state.activeSide, scored, throwsForTurn.length, 0);
    const resetSides: Record<MatchSide, SideState> = {
      home: {
        ...updatedSides.home,
        legs: state.activeSide === "home" ? nextLegs : updatedSides.home.legs,
        score: wonGame ? 0 : start,
      },
      away: {
        ...updatedSides.away,
        legs: state.activeSide === "away" ? nextLegs : updatedSides.away.legs,
        score: wonGame ? 0 : start,
      },
    };
    if (!wonGame) {
      resetSides.home.score = start;
      resetSides.away.score = start;
    }
    const history = addVisit(state.lastVisits, {
      side: state.activeSide,
      score: scored,
      text: `${gameSideNames(state.activeSide)}: ${scored} - leg`,
    });
    const nextState: ScoreboardState = {
      ...state,
      sides: resetSides,
      activeSide: wonGame ? state.activeSide : nextStarter,
      startingSide: wonGame ? state.startingSide : nextStarter,
      turnStartScore: wonGame ? 0 : start,
      currentThrows: [],
      lastVisits: history,
      gameFinished: wonGame,
      isSaved: false,
      legWinnerSide: state.activeSide,
    };

    if (wonGame) {
      void saveGame(nextState);
    }

    return nextState;
  }

  function handleDart(value: number) {
    if (isCricket || scoreboard.gameFinished || isSaving) return;
    if (value === 25 && multiplier === 3) return;

    const score = throwScore(value, multiplier);
    const dart: DartThrow = {
      value,
      multiplier,
      score,
      label: throwLabel(value, multiplier),
    };
    const throwsForTurn = [...scoreboard.currentThrows, dart];
    const scoreBefore = scoreboard.sides[scoreboard.activeSide].score;
    const nextScore = scoreBefore - score;
    const multiplierName = multiplierLabels[multiplier];

    setDartSnapshots((current) => [...current, scoreboard].slice(-60));
    setMultiplier(1);

    if (
      nextScore < 0 ||
      nextScore === 1 ||
      (nextScore === 0 && !isValidDoubleOutFinish(scoreBefore, value, multiplierName))
    ) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(handleBust(scoreboard, throwsForTurn));
      return;
    }

    const nextState: ScoreboardState = {
      ...scoreboard,
      sides: {
        ...scoreboard.sides,
        [scoreboard.activeSide]: {
          ...scoreboard.sides[scoreboard.activeSide],
          score: nextScore,
        },
      },
      currentThrows: throwsForTurn,
      isSaved: false,
      legWinnerSide: null,
    };

    if (nextScore === 0) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(handleLegWin(nextState, throwsForTurn));
      setDartSnapshots([]);
      return;
    }

    if (throwsForTurn.length >= 3) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(finishVisit(nextState, throwsForTurn));
      setDartSnapshots([]);
      return;
    }

    setScoreboard(nextState);
  }

  function exitScoreboard() {
    if (window.confirm("Skutečně chcete Počítadlo ukončit?")) {
      router.push("/");
    }
  }

  function undoLastDart() {
    const previous = dartSnapshots.at(-1);
    if (!previous) return;
    setScoreboard(previous);
    setDartSnapshots((current) => current.slice(0, -1));
    setMultiplier(1);
    setError(null);
  }

  function undoLastVisit() {
    const previous = visitSnapshots.at(-1);
    if (!previous) return;
    setScoreboard(previous);
    setVisitSnapshots((current) => current.slice(0, -1));
    setDartSnapshots([]);
    setMultiplier(1);
    setError(null);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061A3A] px-6 text-white">
        <p className="text-xl font-black">Načítám počítadlo...</p>
      </main>
    );
  }

  if (!payload.match || error && !selectedGame) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061A3A] px-6 text-white">
        <div className="max-w-xl rounded-3xl border border-red-400/40 bg-red-950/40 p-8 text-center">
          <p className="text-xl font-bold">{error ?? "Zápas nebyl nalezen."}</p>
          <Link className="mt-5 inline-flex rounded-full bg-white px-5 py-3 font-bold text-[#061A3A]" href="/admin/matches">
            Zpět na zápasy
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#061A3A] text-white md:h-screen md:overflow-hidden">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-[1500px] flex-col gap-2 px-2 py-2 md:h-screen md:gap-3 md:px-4 md:py-3">
        <header className="rounded-[20px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-[26px] sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link className="text-xs font-bold text-sky-200 hover:text-white sm:text-sm" href={`/admin/matches/${matchId}`}>
                Zpět na zápis utkání
              </Link>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl md:text-5xl">Počítadlo zápasu</h1>
              <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                {payload.season?.name ?? "Sezóna"} / {payload.league?.name ?? "Liga"} / {payload.group?.name ?? "Skupina"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/20 sm:px-5 sm:py-3 sm:text-sm"
                onClick={() => void requestFullscreen()}
                type="button"
              >
                {isFullscreen ? "Ukončit celou obrazovku" : "Celá obrazovka"}
              </button>
              <div className="rounded-2xl bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-200 sm:px-4 sm:py-3 sm:text-sm">
                {wakeLockStatus}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm font-bold text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid flex-1 gap-2 md:min-h-0 md:gap-3 xl:grid-cols-[300px_1fr_300px] 2xl:grid-cols-[330px_1fr_320px]">
          <aside className="flex flex-col gap-2 md:min-h-0 md:gap-3">
            <div className="rounded-[20px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/25 sm:rounded-[26px] sm:p-4">
              <label className="text-sm font-bold text-slate-300" htmlFor="scoreboard-game">
                Hra v zápisu
              </label>
              <select
                className="mt-2 w-full rounded-2xl border border-white/15 bg-[#0B2F6B] px-3 py-3 text-sm font-black text-white outline-none focus:border-emerald-300 sm:px-4 sm:py-4 sm:text-base"
                id="scoreboard-game"
                onChange={(event) => handleGameChange(Number(event.target.value))}
                value={selectedOrder}
              >
                {gameOptions.map((game) => (
                  <option key={game.order_number} value={game.order_number}>
                    {game.order_number}. {gameTypeLabels[game.game_type]}
                  </option>
                ))}
              </select>

              <dl className="mt-4 grid gap-2 text-sm text-slate-300">
                <div className="rounded-2xl bg-black/20 p-3">
                  <dt className="font-bold text-slate-400">Utkání</dt>
                  <dd className="mt-1 font-black text-white">{homeTeamName} - {awayTeamName}</dd>
                </div>
                <div className="rounded-2xl bg-black/20 p-3">
                  <dt className="font-bold text-slate-400">Stav zápasu</dt>
                  <dd className="mt-1 font-black text-white">{statusLabels[payload.match.status]}</dd>
                </div>
                <div className="rounded-2xl bg-black/20 p-3">
                  <dt className="font-bold text-slate-400">Režim hry</dt>
                  <dd className="mt-1 font-black text-white">{isCricket ? "Kriket" : `${mode} DO`}</dd>
                </div>
              </dl>
            </div>

            <div className="order-last overflow-hidden rounded-[20px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/25 sm:rounded-[26px] sm:p-4 xl:order-none xl:min-h-0 xl:flex-1">
              <h2 className="text-lg font-black">Historie náhozů</h2>
              <div className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1 xl:max-h-full">
                {scoreboard.lastVisits.length === 0 ? (
                  <p className="rounded-2xl bg-black/20 p-4 text-sm text-slate-300">
                    Zatím není zadaný žádný nához.
                  </p>
                ) : (
                  scoreboard.lastVisits.map((item, index) => (
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                        item.bust ? "bg-red-500/15 text-red-100" : "bg-black/20 text-slate-100"
                      }`}
                      key={`${item.side}:${item.text}:${index}`}
                    >
                      {item.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="flex flex-col gap-2 md:min-h-0 md:gap-3">
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {(["home", "away"] as MatchSide[]).map((side) => {
                const isActive = scoreboard.activeSide === side;
                return (
                  <div
                    className={`rounded-[22px] border p-3 shadow-2xl shadow-black/30 transition sm:rounded-[32px] sm:p-5 ${
                      isActive
                        ? "border-emerald-300 bg-emerald-400/15 ring-2 ring-emerald-300/40"
                        : "border-white/10 bg-white/8 opacity-70"
                    }`}
                    key={side}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-300 sm:text-xs sm:tracking-[0.18em]">{sideLabels[side]}</p>
                        <h2 className="mt-1 line-clamp-2 text-sm font-black sm:text-xl md:text-2xl">{gameSideNames(side)}</h2>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isActive ? (
                          <span className="rounded-full bg-emerald-300 px-2 py-1 text-[10px] font-black text-[#061A3A] sm:px-3 sm:text-xs">
                            Na tahu
                          </span>
                        ) : null}
                        {isActive && scoreboard.sides[side].score <= 170 ? (
                          <span className="max-w-[10rem] rounded-2xl bg-black/25 px-2 py-1 text-right text-xs font-black text-emerald-100 sm:max-w-[13rem] sm:px-3 sm:text-sm">
                            {checkout ? checkout.primary.join(" ") : "Nelze zavřít"}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#061A3A] sm:px-3 sm:text-xs">
                          Legy {scoreboard.sides[side].legs}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-6xl font-black leading-none tracking-tight sm:mt-4 sm:text-[6rem] md:text-[7.5rem]">
                      {scoreboard.sides[side].score}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-bold text-slate-300 sm:mt-3 sm:gap-2 sm:text-xs">
                      <span>Průměr: {average(scoreboard.sides[side])}</span>
                      <span>
                        Poslední: {scoreboard.sides[side].visits.slice(0, 4).join(", ") || "0"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {scoreboard.legWinnerSide ? (
              <div className="rounded-[26px] border border-emerald-300/50 bg-emerald-400/20 px-5 py-4 text-center text-xl font-black text-emerald-100">
                Leg vyhráli {scoreboard.legWinnerSide === "home" ? "domácí" : "hosté"}
              </div>
            ) : null}

            {isCricket ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[30px] border border-amber-300/30 bg-amber-400/10 p-8 text-center">
                <h2 className="text-3xl font-black text-amber-100">Kriket připravujeme</h2>
                <p className="mt-3 max-w-xl text-amber-50/80">
                  Pro kriket je zatím připravený pouze zástupný režim. Výsledek kriketu lze uložit v zápisu utkání.
                </p>
              </div>
            ) : (
              <div className="flex-1 rounded-[22px] border border-white/10 bg-white/8 p-2 shadow-2xl shadow-black/25 sm:rounded-[30px] sm:p-4 md:min-h-0">
                <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-100">Na tahu</p>
                    <h2 className="text-xl font-black text-emerald-200 sm:text-2xl">{gameSideNames(scoreboard.activeSide)}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-300 sm:text-sm">
                      Šipka {Math.min(scoreboard.currentThrows.length + 1, 3)}/3 · {currentThrowText}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([1, 2, 3] as Multiplier[]).map((item) => (
                      <button
                        className={`rounded-2xl px-3 py-2.5 text-xs font-black transition sm:px-5 sm:py-3 sm:text-base ${
                          multiplier === item
                            ? "bg-orange-400 text-[#061A3A]"
                            : "bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                        }`}
                        key={item}
                        onClick={() => setMultiplier(item)}
                        type="button"
                      >
                        {item === 1 ? "SINGLE" : item === 2 ? "DOUBLE" : "TRIPLE"}
                      </button>
                    ))}
                    <button
                      className="rounded-2xl bg-white/10 px-3 py-2.5 text-xs font-black text-white transition hover:bg-white/20 sm:px-5 sm:py-3 sm:text-base"
                      onClick={exitScoreboard}
                      type="button"
                    >
                      Ukončit
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 lg:grid-cols-11">
                  <button
                    className="min-h-12 rounded-2xl bg-slate-200 text-base font-black text-[#061A3A] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-14 sm:text-xl"
                    disabled={scoreboard.gameFinished || isSaving}
                    onClick={() => handleDart(0)}
                    type="button"
                  >
                    MISS
                  </button>
                  {keypadValues.map((value) => (
                    <button
                      className="min-h-12 rounded-2xl bg-white text-lg font-black text-[#061A3A] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300 sm:min-h-14 sm:text-2xl"
                      disabled={scoreboard.gameFinished || isSaving || (value === 25 && multiplier === 3)}
                      key={value}
                      onClick={() => handleDart(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-2 md:min-h-0 md:gap-3">
            <div className="rounded-[20px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/25 sm:rounded-[26px] sm:p-4">
              <h2 className="text-lg font-black sm:text-xl">Ovládání</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
                <button
                  className="rounded-2xl bg-red-500 px-3 py-3 text-xs font-black text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-4 sm:text-base"
                  disabled={dartSnapshots.length === 0}
                  onClick={undoLastDart}
                  type="button"
                >
                  Vrátit šipku
                </button>
                <button
                  className="rounded-2xl bg-red-500/80 px-3 py-3 text-xs font-black text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-4 sm:text-base"
                  disabled={visitSnapshots.length === 0}
                  onClick={undoLastVisit}
                  type="button"
                >
                  Vrátit nához
                </button>
                <button
                  className="col-span-2 rounded-2xl bg-emerald-400 px-3 py-3 text-xs font-black text-[#061A3A] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-4 sm:text-base xl:col-span-1"
                  disabled={isSaving || !selectedGame}
                  onClick={() => void saveGame()}
                  type="button"
                >
                  {isSaving ? "Ukládám..." : scoreboard.isSaved ? "Uloženo" : "Uložit stav hry"}
                </button>
              </div>
              <p className="mt-3 text-xs font-bold text-slate-400">
                Hraje se na {winningLegs} {winningLegs === 1 ? "vítězný leg" : "vítězné legy"}. Zavření musí být double nebo Bull.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
