"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useMemo, useState } from "react";
import {
  getCheckout,
  isValidDoubleOutFinish,
} from "@/lib/dartsCheckout";
import type { MultiplierName } from "@/lib/dartsCheckout";
import { useMobileFullscreen } from "@/lib/useMobileFullscreen";

type GameType = "301" | "501" | "701" | "cricket";
type StartMode = "straight_in" | "double_in";
type FinishMode = "straight_out" | "double_out";
type Multiplier = 1 | 2 | 3;
type PlayerState = {
  id: number;
  name: string;
  score: number;
  legs: number;
  sets: number;
  isOpen: boolean;
  totalScored: number;
  dartsThrown: number;
  visitScores: number[];
  lastThrows: string[];
};
type ThrowItem = {
  value: number;
  multiplier: Multiplier;
  score: number;
  label: string;
};
type TurnHistory = {
  playerName: string;
  score: number;
  text: string;
  bust?: boolean;
};
type GameSettings = {
  playerCount: number;
  legsToWin: number;
  setsToWin: number;
  gameType: GameType;
  startMode: StartMode;
  finishMode: FinishMode;
  playerNames: string[];
};
type ScoreboardState = {
  players: PlayerState[];
  activePlayerIndex: number;
  startingPlayerIndex: number;
  turnStartScore: number;
  currentThrows: ThrowItem[];
  lastVisits: TurnHistory[];
  legWinnerName: string | null;
  matchWinnerName: string | null;
};

const defaultSettings: GameSettings = {
  playerCount: 2,
  legsToWin: 3,
  setsToWin: 1,
  gameType: "501",
  startMode: "straight_in",
  finishMode: "double_out",
  playerNames: ["HrĂˇÄŤ 1", "HrĂˇÄŤ 2"],
};

const numberButtons = Array.from({ length: 20 }, (_, index) => index + 1).concat(25);
const multiplierLabels: Record<Multiplier, MultiplierName> = {
  1: "single",
  2: "double",
  3: "triple",
};

function gameStartScore(gameType: GameType) {
  if (gameType === "301") return 301;
  if (gameType === "701") return 701;
  return 501;
}

function throwLabel(value: number, multiplier: Multiplier) {
  if (value === 0) return "MISS";
  if (value === 25 && multiplier === 2) return "Bull";
  if (multiplier === 2) return `D${value}`;
  if (multiplier === 3) return `T${value}`;
  return String(value);
}

function normalizeCount(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function createInitialState(settings: GameSettings): ScoreboardState {
  const score = gameStartScore(settings.gameType);
  return {
    players: Array.from({ length: settings.playerCount }, (_, index) => ({
      id: index,
      name: settings.playerNames[index]?.trim() || `HrĂˇÄŤ ${index + 1}`,
      score,
      legs: 0,
      sets: 0,
      isOpen: settings.startMode === "straight_in",
      totalScored: 0,
      dartsThrown: 0,
      visitScores: [],
      lastThrows: [],
    })),
    activePlayerIndex: 0,
    startingPlayerIndex: 0,
    turnStartScore: score,
    currentThrows: [],
    lastVisits: [],
    legWinnerName: null,
    matchWinnerName: null,
  };
}

function nextIndex(index: number, playerCount: number) {
  return (index + 1) % playerCount;
}

function average(player: PlayerState) {
  if (player.dartsThrown === 0) return "0.00";
  return ((player.totalScored / player.dartsThrown) * 3).toFixed(2);
}

function addVisit(history: TurnHistory[], item: TurnHistory) {
  return [item, ...history].slice(0, 14);
}

function visitScore(throwsForTurn: ThrowItem[]) {
  return throwsForTurn.reduce((sum, dart) => sum + dart.score, 0);
}

function visitsText(player: PlayerState) {
  return player.visitScores.slice(0, 4).join(" / ") || "-";
}

function lastThrowsText(player: PlayerState, isActive: boolean, currentThrows: ThrowItem[]) {
  if (isActive && currentThrows.length > 0) {
    return currentThrows.map((item) => item.label).join("  ");
  }

  return player.lastThrows.join("  ") || "ÄŚekĂˇ se na hod";
}

export default function PublicScoreboardPage() {
  const router = useRouter();
  const { fullscreenMessage, isFullscreen, toggleFullscreen } = useMobileFullscreen();
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const [multiplier, setMultiplier] = useState<Multiplier>(1);
  const [dartSnapshots, setDartSnapshots] = useState<ScoreboardState[]>([]);
  const [visitSnapshots, setVisitSnapshots] = useState<ScoreboardState[]>([]);

  const activePlayer = scoreboard?.players[scoreboard.activePlayerIndex] ?? null;
  const isCricket = settings.gameType === "cricket";
  const checkout = activePlayer && !isCricket && settings.finishMode === "double_out"
    ? getCheckout(activePlayer.score)
    : null;

  const currentThrowText = useMemo(() => {
    if (!scoreboard || scoreboard.currentThrows.length === 0) return "ÄŚekĂˇ se na prvnĂ­ hod";
    return scoreboard.currentThrows.map((item) => item.label).join(" + ");
  }, [scoreboard]);

  function updateSettings(nextSettings: Partial<GameSettings>) {
    setSettings((current) => ({ ...current, ...nextSettings }));
  }

  function handlePlayerCountChange(event: ChangeEvent<HTMLInputElement>) {
    const playerCount = normalizeCount(event.target.value, 1, 8);
    setSettings((current) => ({
      ...current,
      playerCount,
      playerNames: Array.from(
        { length: playerCount },
        (_, index) => current.playerNames[index] ?? `HrĂˇÄŤ ${index + 1}`,
      ),
    }));
  }

  function handlePlayerNameChange(index: number, value: string) {
    setSettings((current) => {
      const playerNames = [...current.playerNames];
      playerNames[index] = value;
      return { ...current, playerNames };
    });
  }

  function startGame() {
    setDartSnapshots([]);
    setVisitSnapshots([]);
    setMultiplier(1);
    setScoreboard(createInitialState(settings));
  }

  function resetLeg(state: ScoreboardState, nextStartingIndex: number) {
    const score = gameStartScore(settings.gameType);
    return {
      ...state,
      players: state.players.map((player) => ({
        ...player,
        score,
        isOpen: settings.startMode === "straight_in",
        visitScores: [],
      })),
      activePlayerIndex: nextStartingIndex,
      startingPlayerIndex: nextStartingIndex,
      turnStartScore: score,
      currentThrows: [],
    };
  }

  function switchPlayer(state: ScoreboardState, history: TurnHistory[]) {
    const nextActiveIndex = nextIndex(state.activePlayerIndex, state.players.length);
    return {
      ...state,
      activePlayerIndex: nextActiveIndex,
      turnStartScore: state.players[nextActiveIndex].score,
      currentThrows: [],
      lastVisits: history,
      legWinnerName: null,
    };
  }

  function finishVisit(state: ScoreboardState, throwsForTurn: ThrowItem[], note?: string) {
    const player = state.players[state.activePlayerIndex];
    const scored = visitScore(throwsForTurn);
    const history = addVisit(state.lastVisits, {
      playerName: player.name,
      score: scored,
      text: note ? `${scored} - ${note}` : String(scored),
    });
    return switchPlayer(
      {
        ...state,
        players: state.players.map((item, index) =>
          index === state.activePlayerIndex
            ? {
                ...item,
                lastThrows: throwsForTurn.map((dart) => dart.label),
                visitScores: [scored, ...item.visitScores].slice(0, 8),
              }
            : item,
        ),
      },
      history,
    );
  }

  function handleBust(state: ScoreboardState, throwsForTurn: ThrowItem[]) {
    const player = state.players[state.activePlayerIndex];
    const history = addVisit(state.lastVisits, {
      playerName: player.name,
      score: 0,
      text: "pĹ™ehoz",
      bust: true,
    });
    const restoredPlayers = state.players.map((item, index) =>
      index === state.activePlayerIndex
        ? {
            ...item,
            lastThrows: throwsForTurn.map((dart) => dart.label),
            score: state.turnStartScore,
            visitScores: [0, ...item.visitScores].slice(0, 8),
          }
        : item,
    );
    return switchPlayer({ ...state, players: restoredPlayers }, history);
  }

  function handleLegWin(state: ScoreboardState, throwsForTurn: ThrowItem[]) {
    const player = state.players[state.activePlayerIndex];
    const scored = visitScore(throwsForTurn);
    const nextPlayers = state.players.map((item, index) => {
      if (index !== state.activePlayerIndex) return item;
      const nextLegs = item.legs + 1;
      const wonSet = nextLegs >= settings.legsToWin;
      return {
        ...item,
        legs: wonSet ? 0 : nextLegs,
        sets: wonSet ? item.sets + 1 : item.sets,
        lastThrows: throwsForTurn.map((dart) => dart.label),
        visitScores: [scored, ...item.visitScores].slice(0, 8),
      };
    });
    const updatedPlayer = nextPlayers[state.activePlayerIndex];
    const matchWinnerName = updatedPlayer.sets >= settings.setsToWin ? updatedPlayer.name : null;
    const history = addVisit(state.lastVisits, {
      playerName: player.name,
      score: scored,
      text: `${scored} - leg`,
    });

    if (matchWinnerName) {
      return {
        ...state,
        players: nextPlayers,
        currentThrows: [],
        lastVisits: history,
        legWinnerName: player.name,
        matchWinnerName,
      };
    }

    return resetLeg(
      {
        ...state,
        players: nextPlayers,
        lastVisits: history,
        legWinnerName: player.name,
      },
      nextIndex(state.startingPlayerIndex, state.players.length),
    );
  }

  function addScoredDart(player: PlayerState, dart: ThrowItem, nextScore: number, hasOpened: boolean) {
    return {
      ...player,
      score: nextScore,
      isOpen: hasOpened,
      totalScored: player.totalScored + dart.score,
      dartsThrown: player.dartsThrown + 1,
    };
  }

  function handleThrow(value: number, selectedMultiplier = multiplier) {
    if (!scoreboard || isCricket || scoreboard.matchWinnerName) return;
    if (value === 25 && selectedMultiplier === 3) return;

    const player = scoreboard.players[scoreboard.activePlayerIndex];
    const dartScore = value * selectedMultiplier;
    const dart: ThrowItem = {
      value,
      multiplier: selectedMultiplier,
      score: dartScore,
      label: throwLabel(value, selectedMultiplier),
    };
    const throwsForTurn = [...scoreboard.currentThrows, dart];
    const hasOpened = player.isOpen || settings.startMode === "straight_in" || selectedMultiplier === 2;

    setDartSnapshots((current) => [...current, scoreboard].slice(-80));

    if (!hasOpened) {
      const nextState = {
        ...scoreboard,
        currentThrows: throwsForTurn,
        players: scoreboard.players.map((item, index) =>
          index === scoreboard.activePlayerIndex
            ? { ...item, dartsThrown: item.dartsThrown + 1 }
            : item,
        ),
      };
      if (throwsForTurn.length >= 3) {
        setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
        setScoreboard(finishVisit(nextState, throwsForTurn, "ÄŤekĂˇ na double in"));
      } else {
        setScoreboard(nextState);
      }
      setMultiplier(1);
      return;
    }

    const nextScore = player.score - dartScore;
    const isBust =
      nextScore < 0 ||
      (settings.finishMode === "double_out" && nextScore === 1) ||
      (nextScore === 0 &&
        settings.finishMode === "double_out" &&
        !isValidDoubleOutFinish(player.score, value, multiplierLabels[selectedMultiplier]));

    if (isBust) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(handleBust(scoreboard, throwsForTurn));
      setMultiplier(1);
      return;
    }

    const nextPlayers = scoreboard.players.map((item, index) =>
      index === scoreboard.activePlayerIndex
        ? addScoredDart(item, dart, nextScore, true)
        : item,
    );
    const nextState = { ...scoreboard, players: nextPlayers, currentThrows: throwsForTurn };

    if (nextScore === 0) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(handleLegWin(nextState, throwsForTurn));
      setMultiplier(1);
      return;
    }

    if (throwsForTurn.length >= 3) {
      setVisitSnapshots((current) => [...current, scoreboard].slice(-30));
      setScoreboard(finishVisit(nextState, throwsForTurn));
      setMultiplier(1);
      return;
    }

    setScoreboard(nextState);
    setMultiplier(1);
  }

  function exitScoreboard() {
    if (window.confirm("SkuteÄŤnÄ› chcete PoÄŤĂ­tadlo ukonÄŤit?")) {
      router.push("/");
    }
  }

  function undoLastDart() {
    const snapshot = dartSnapshots.at(-1);
    if (!snapshot) return;
    setScoreboard(snapshot);
    setDartSnapshots((current) => current.slice(0, -1));
    setMultiplier(1);
  }

  function undoLastVisit() {
    const snapshot = visitSnapshots.at(-1);
    if (!snapshot) return;
    setScoreboard(snapshot);
    setVisitSnapshots((current) => current.slice(0, -1));
    setDartSnapshots((current) => [...current, snapshot].slice(-80));
    setMultiplier(1);
  }

  if (scoreboard) {
    return (
      <main className="min-h-[100svh] bg-[#061A3A] text-white md:h-screen md:overflow-hidden">
        <div className="mx-auto flex min-h-[100svh] max-w-[1500px] flex-col gap-2 px-2 py-2 md:h-screen md:gap-3 md:px-3 md:py-3 lg:px-5">
          <header className="flex shrink-0 flex-col gap-2 rounded-[20px] border border-white/10 bg-white/8 p-2 shadow-2xl shadow-black/25 sm:rounded-[24px] sm:p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <button className="text-xs font-black text-blue-200 hover:text-white" onClick={() => setScoreboard(null)} type="button">
                ZpÄ›t na nastavenĂ­
              </button>
              <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl md:text-4xl">PoÄŤĂ­tadlo</h1>
              <p className="mt-1 text-[11px] font-bold text-blue-100 sm:text-xs">
                {settings.gameType === "cricket" ? "Kriket" : `${settings.gameType} bodĹŻ`} / {settings.startMode === "double_in" ? "double in" : "straight in"} / {settings.finishMode === "double_out" ? "double out" : "straight out"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white sm:px-4 sm:py-2.5 sm:text-sm" onClick={() => void toggleFullscreen()} type="button">
                {isFullscreen ? "UkonÄŤit celou obrazovku" : "CelĂˇ obrazovka"}
              </button>
              <button className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-[#061A3A] sm:px-4 sm:py-2.5 sm:text-sm" onClick={startGame} type="button">
                NovĂˇ hra
              </button>
              <Link className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white sm:px-4 sm:py-2.5 sm:text-sm" href="/">
                ĂšvodnĂ­ strĂˇnka
              </Link>
            </div>
          </header>

          {fullscreenMessage ? (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
              {fullscreenMessage}
            </div>
          ) : null}

          {isCricket ? (
            <section className="flex min-h-0 flex-1 items-center justify-center rounded-[28px] border border-amber-300/30 bg-amber-400/10 p-8 text-center">
              <div>
                <h2 className="text-4xl font-black text-amber-100">Kriket pĹ™ipravujeme</h2>
                <p className="mt-4 max-w-2xl text-lg font-bold text-amber-50/80">
                  NastavenĂ­ kriketu uĹľ je pĹ™ipravenĂ©. SamotnĂ© bodovĂˇnĂ­ kriketu doplnĂ­me v dalĹˇĂ­ iteraci.
                </p>
              </div>
            </section>
          ) : (
            <div className="grid flex-1 gap-2 md:min-h-0 md:gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="flex flex-col gap-2 md:min-h-0 md:gap-3">
                <div className="grid shrink-0 grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
                  {scoreboard.players.map((player, index) => {
                    const isActive = index === scoreboard.activePlayerIndex;
                    return (
                      <div
                        className={`relative rounded-[22px] border p-3 shadow-2xl shadow-black/25 transition sm:rounded-[28px] sm:p-5 ${
                          isActive
                            ? "border-emerald-300 bg-emerald-400/18 ring-4 ring-emerald-300/20"
                            : "border-white/10 bg-white/7 opacity-70"
                        }`}
                        key={player.id}
                      >
                        {isActive ? (
                          <div className="absolute right-2 top-2 flex max-w-[8.5rem] flex-col items-end gap-1 sm:right-3 sm:top-3 sm:max-w-[11rem]">
                            <span className="rounded-full bg-emerald-300 px-2 py-1 text-[10px] font-black text-[#061A3A] sm:px-3 sm:text-xs">
                              Na tahu
                            </span>
                            {player.score <= 170 ? (
                              <span className="rounded-2xl bg-black/25 px-2 py-1 text-right text-xs font-black text-emerald-100 sm:px-3 sm:text-sm">
                                {checkout ? checkout.primary.join(" ") : "Nelze zavĹ™Ă­t"}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 sm:text-xs">Hráč</p>
                        <h2 className="mt-1 max-w-[8rem] truncate text-lg font-black sm:max-w-[12rem] sm:text-2xl">{player.name}</h2>
                        <p className="mt-3 text-5xl font-black leading-none tracking-tight sm:mt-5 sm:text-6xl md:text-7xl">{player.score}</p>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 sm:mt-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-100/80">Poslední šipky</p>
                          <p className="mt-1 min-h-6 text-lg font-black text-white sm:text-2xl">
                            {lastThrowsText(player, isActive, scoreboard.currentThrows)}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black text-blue-100 sm:mt-3 sm:text-xs">
                          <span className="rounded-full bg-white/10 px-2 py-1">Průměr {average(player)}</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">Sety {player.sets}</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">Legy {player.legs}</span>
                        </div>
                        <p className="mt-1 truncate text-[10px] font-bold text-blue-100/80 sm:mt-2 sm:text-xs">Náhozy: {visitsText(player)}</p>
                      </div>
                    );
                  })}
                </div>

                {scoreboard.legWinnerName ? (
                  <div className="shrink-0 rounded-3xl border border-emerald-300/40 bg-emerald-400/15 px-5 py-4">
                    <p className="text-2xl font-black text-emerald-100">
                      Leg vyhrĂˇl hrĂˇÄŤ {scoreboard.legWinnerName}
                    </p>
                  </div>
                ) : null}

                <div className="grid flex-1 gap-2 md:min-h-0 md:gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <section className="rounded-[22px] border border-white/10 bg-white/8 p-2 shadow-2xl shadow-black/25 sm:rounded-[28px] sm:p-3 md:min-h-0">
                    <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-blue-100">Na tahu</p>
                        <h2 className="text-xl font-black text-emerald-200 sm:text-2xl">{activePlayer?.name}</h2>
                        <p className="mt-1 text-xs font-bold text-blue-100 sm:text-sm">
                          Ĺ ipka {Math.min((scoreboard.currentThrows.length || 0) + 1, 3)}/3 Â· {currentThrowText}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3].map((item) => (
                          <button
                            className={`rounded-2xl px-3 py-2.5 text-xs font-black transition sm:px-4 sm:py-3 sm:text-sm ${
                              multiplier === item
                                ? "bg-orange-400 text-[#061A3A]"
                                : "bg-orange-500/20 text-orange-100"
                            }`}
                            key={item}
                            onClick={() => setMultiplier(item as Multiplier)}
                            type="button"
                          >
                            {item === 1 ? "SINGLE" : item === 2 ? "DOUBLE" : "TRIPLE"}
                          </button>
                        ))}
                        <button className="rounded-2xl bg-white px-3 py-2.5 text-xs font-black text-[#061A3A] sm:px-4 sm:py-3 sm:text-sm" onClick={exitScoreboard} type="button">
                          UkonÄŤit
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 xl:grid-cols-8">
                      <button
                        className="min-h-12 rounded-2xl bg-[#EF233C] text-base font-black text-white shadow-lg shadow-black/20 transition active:scale-[0.98] sm:min-h-14 sm:text-lg"
                        disabled={Boolean(scoreboard.matchWinnerName)}
                        onClick={() => handleThrow(0, 1)}
                        type="button"
                      >
                        MISS
                      </button>
                      {numberButtons.map((value) => (
                        <button
                          className="min-h-12 rounded-2xl bg-white text-lg font-black text-[#061A3A] shadow-lg shadow-black/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300 sm:min-h-14 sm:text-xl md:min-h-16 md:text-2xl"
                          disabled={Boolean(scoreboard.matchWinnerName) || (value === 25 && multiplier === 3)}
                          key={value}
                          onClick={() => handleThrow(value)}
                          type="button"
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </section>

                  <aside className="rounded-[22px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/25 sm:rounded-[28px] sm:p-4 md:min-h-0">
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                      <button
                        className="rounded-2xl bg-[#EF233C] px-3 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                        disabled={dartSnapshots.length === 0}
                        onClick={undoLastDart}
                        type="button"
                      >
                        VrĂˇtit Ĺˇipku
                      </button>
                      <button
                        className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                        disabled={visitSnapshots.length === 0}
                        onClick={undoLastVisit}
                        type="button"
                      >
                        VrĂˇtit nĂˇhoz
                      </button>
                    </div>
                  </aside>
                </div>
              </section>

              <aside className="overflow-hidden rounded-[22px] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/25 sm:rounded-[28px] sm:p-4 md:min-h-0">
                <h2 className="text-lg font-black sm:text-xl">Historie nĂˇhozĹŻ</h2>
                <div className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1 sm:mt-4 md:max-h-[calc(100vh-12rem)]">
                  {scoreboard.lastVisits.length === 0 ? (
                    <p className="rounded-2xl bg-black/20 p-4 text-sm font-bold text-blue-100">ZatĂ­m nenĂ­ zadanĂ˝ ĹľĂˇdnĂ˝ nĂˇhoz.</p>
                  ) : (
                    scoreboard.lastVisits.map((item, index) => (
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm font-bold ${item.bust ? "bg-red-500/15 text-red-100" : "bg-black/20 text-blue-50"}`}
                        key={`${item.playerName}:${item.text}:${index}`}
                      >
                        {item.playerName}: {item.text}
                      </div>
                    ))
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F8FF] text-[#0B1F3A]">
      <section className="relative overflow-hidden bg-[#061A3A] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.26),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(239,35,60,0.20),transparent_28%)]" />
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-5">
          <Link className="flex items-center gap-3" href="/">
            <Image alt="Logo ZnojemskĂ©ho ĹˇipkaĹ™skĂ©ho spolku" className="h-16 w-16 object-contain" height={256} src="/brand/zss-logo-official.png" width={256} />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">NeoficiĂˇlnĂ­ zĂˇpasy</p>
              <h1 className="text-3xl font-black">PoÄŤĂ­tadlo</h1>
            </div>
          </Link>
          <Link className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#061A3A]" href="/">
            ZpÄ›t na web
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="rounded-[28px] bg-[#061A3A] p-6 text-white shadow-[0_20px_60px_rgba(6,26,58,0.18)]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3B82F6]">RychlĂ© poÄŤĂ­tadlo</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">NastavenĂ­ hry</h2>
          <p className="mt-4 text-lg font-bold text-blue-100">
            Vyber poÄŤet hrĂˇÄŤĹŻ, legy, sety a pravidla zavĂ­rĂˇnĂ­. Po potvrzenĂ­ se otevĹ™e velkĂ© tabletovĂ© poÄŤĂ­tadlo.
          </p>
        </div>

        <form
          className="rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            startGame();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              PoÄŤet hrĂˇÄŤĹŻ
              <input className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" max={8} min={1} onChange={handlePlayerCountChange} type="number" value={settings.playerCount} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              PoÄŤet legĹŻ
              <input className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" max={9} min={1} onChange={(event) => updateSettings({ legsToWin: normalizeCount(event.target.value, 1, 9) })} type="number" value={settings.legsToWin} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              PoÄŤet setĹŻ
              <input className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" max={9} min={1} onChange={(event) => updateSettings({ setsToWin: normalizeCount(event.target.value, 1, 9) })} type="number" value={settings.setsToWin} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Druh hry
              <select className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" onChange={(event) => updateSettings({ gameType: event.target.value as GameType })} value={settings.gameType}>
                <option value="301">301</option>
                <option value="501">501</option>
                <option value="701">701</option>
                <option value="cricket">Kriket</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              ZaÄŤĂˇtek hry
              <select className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" onChange={(event) => updateSettings({ startMode: event.target.value as StartMode })} value={settings.startMode}>
                <option value="straight_in">Straight in</option>
                <option value="double_in">Double in</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              ZavĹ™enĂ­ hry
              <select className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" onChange={(event) => updateSettings({ finishMode: event.target.value as FinishMode })} value={settings.finishMode}>
                <option value="straight_out">Straight out</option>
                <option value="double_out">Double out</option>
              </select>
            </label>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#EF233C]">JmĂ©na hrĂˇÄŤĹŻ</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: settings.playerCount }, (_, index) => (
                <label className="grid gap-2 text-sm font-black text-[#061A3A]" key={index}>
                  HrĂˇÄŤ {index + 1}
                  <input className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-base outline-none focus:border-[#0F4FA8]" onChange={(event) => handlePlayerNameChange(index, event.target.value)} type="text" value={settings.playerNames[index] ?? ""} />
                </label>
              ))}
            </div>
          </div>

          <button className="mt-7 w-full rounded-2xl bg-[#EF233C] px-6 py-4 text-lg font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500" type="submit">
            OtevĹ™Ă­t poÄŤĂ­tadlo
          </button>
        </form>
      </section>
    </main>
  );
}
