"use client";

import { adminFetch } from "@/lib/adminFetch";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui/admin";
import { MatchInfo, MatchSheet, MatchStatisticsSection } from "@/components/matches/MatchSheet";
import { calculateUsefulnessScore } from "@/lib/playerUsefulness";
import { supabase } from "@/lib/supabase";

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
  status: "opponent_pending" | "pending" | "approved" | "rejected" | "cancelled";
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

function sheetTiebreakPlayed(games: SheetGame[]) {
  const tiebreak = games.find((game) => game.order_number === 19 || game.game_type === "tiebreak_701");
  return tiebreak ? getWinner(tiebreak) !== null : false;
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

const exportBlocks = [
  { title: "Blok 1", subtitle: "První dvouhry", orders: [1, 2, 3, 4] },
  { title: "Blok 2", subtitle: "Druhé dvouhry", orders: [5, 6, 7, 8] },
  { title: "Blok 3", subtitle: "Párové hry", orders: [9, 10] },
  { title: "Blok 4", subtitle: "Třetí dvouhry", orders: [11, 12, 13, 14] },
  { title: "Blok 5", subtitle: "Čtvrté dvouhry", orders: [15, 16, 17, 18] },
  { title: "Rozstřel", subtitle: "Povinně při stavu 9:9", orders: [19] },
];

const exportAchievementLabels: Record<AchievementType, string> = {
  score_95_plus: "95+",
  score_133_plus: "133+",
  score_171_plus: "171+",
  checkout_100_plus: "Zavření 100+",
};
const exportAchievementTypes = Object.keys(exportAchievementLabels) as AchievementType[];

const exportGameTypeLabels: Record<MatchGameType, string> = {
  singles: "Dvouhra",
  doubles: "Čtyřhra",
  cricket: "Kriket",
  tiebreak_701: "Rozstřel 701 DO",
};

type ExportContext = {
  achievements: SheetAchievement[];
  awayPlayers: Player[];
  awayTeamLogoUrl: string | null;
  awayTeamName: string;
  games: SheetGame[];
  homePlayers: Player[];
  homeTeamLogoUrl: string | null;
  homeTeamName: string;
  leagueLabel: string;
  matchDateLabel: string;
  score: Score;
  statistics: PlayerStatistics[];
};

function sanitizeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "zapis";
}

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("JPG se nepodařilo vytvořit."));
    }, "image/jpeg", 0.92);
  });
}

async function downloadCanvasAsJpeg(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await canvasToJpegBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fillWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }
    lines.push(currentLine);
    currentLine = word;
  });
  if (currentLine) lines.push(currentLine);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    let lastLine = visibleLines[visibleLines.length - 1];
    while (lastLine.length > 0 && context.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    visibleLines[visibleLines.length - 1] = `${lastLine}...`;
  }

  visibleLines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + visibleLines.length * lineHeight;
}

function createExportCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Prohlížeč nepodporuje export obrázku.");
  context.fillStyle = "#F4F8FF";
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.stroke();
}

function loadExportImage(url: string | null) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function playerName(players: Player[], id: string | undefined) {
  return players.find((player) => player.id === id)?.display_name ?? "-";
}

function achievementCount(achievements: SheetAchievement[], orderNumber: number, playerId: string | undefined, type: AchievementType) {
  if (!playerId) return 0;
  return achievements
    .filter((achievement) => achievement.order_number === orderNumber && achievement.player_id === playerId && achievement.achievement_type === type)
    .reduce((sum, achievement) => sum + achievement.achievement_count, 0);
}

function drawExportLogo(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  fallbackName: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (image) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    return;
  }

  context.fillStyle = "#FFFFFF";
  fillRoundedRect(context, x + 18, y + 18, width - 36, height - 36, 28);
  context.strokeStyle = "#C8D9EC";
  context.lineWidth = 3;
  strokeRoundedRect(context, x + 18, y + 18, width - 36, height - 36, 28);
  context.fillStyle = "#061A3A";
  context.font = "900 34px Arial";
  context.textAlign = "left";
  fillWrappedText(context, fallbackName.toUpperCase(), x + 42, y + height / 2 - 10, width - 84, 38, 3);
  context.textAlign = "left";
}

function exportMetaLabel(exportContext: ExportContext) {
  const parts = exportContext.leagueLabel
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index, allParts) => index === 0 || part !== allParts[index - 1]);
  return [...parts, exportContext.matchDateLabel].join("  |  ");
}

function drawSheetExportHeader(
  context: CanvasRenderingContext2D,
  exportContext: ExportContext,
  homeLogo: HTMLImageElement | null,
  awayLogo: HTMLImageElement | null,
) {
  context.fillStyle = "#F4F8FF";
  context.fillRect(0, 0, 1600, 430);

  context.fillStyle = "rgba(11, 47, 107, 0.12)";
  for (let index = 0; index < 95; index += 1) {
    const x = (index * 71) % 1600;
    const y = (index * 43) % 430;
    const size = index % 5 === 0 ? 4 : 2;
    context.fillRect(x, y, size, size);
  }

  drawExportLogo(context, homeLogo, exportContext.homeTeamName, 90, 78, 215, 195);
  drawExportLogo(context, awayLogo, exportContext.awayTeamName, 1295, 78, 215, 195);

  context.textAlign = "center";
  context.fillStyle = "#061A3A";
  context.font = "900 76px Arial";
  context.fillText("ZÁPIS UTKÁNÍ", 800, 92);
  context.font = "700 28px Arial";
  context.fillText(exportMetaLabel(exportContext), 800, 145, 870);

  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  fillRoundedRect(context, 530, 178, 540, 175, 14);
  context.strokeStyle = "#86A7CB";
  context.lineWidth = 3;
  strokeRoundedRect(context, 530, 178, 540, 175, 14);

  context.fillStyle = "#061A3A";
  context.font = "900 92px Arial";
  context.fillText(String(exportContext.score.home_points), 720, 278);
  context.fillStyle = "#EF233C";
  context.fillText(String(exportContext.score.away_points), 880, 278);
  context.fillStyle = "#061A3A";
  context.font = "900 78px Arial";
  context.fillText(":", 800, 270);

  context.fillStyle = "#EAF1F9";
  fillRoundedRect(context, 575, 304, 450, 42, 7);
  context.fillStyle = "#061A3A";
  context.font = "900 28px Arial";
  context.fillText(`Legy   ${exportContext.score.home_legs} : ${exportContext.score.away_legs}`, 800, 333);
  context.textAlign = "left";
}

async function drawMatchSheetExport(exportContext: ExportContext) {
  const rowHeight = 54;
  const blockHeaderHeight = 62;
  const blockGap = 22;
  const visibleBlocks = exportBlocks.filter((block) => block.orders.some((order) => exportContext.games.some((game) => game.order_number === order)));
  const height = 500 + visibleBlocks.reduce((sum, block) => {
    const gamesCount = exportContext.games.filter((game) => block.orders.includes(game.order_number)).length;
    return sum + blockHeaderHeight + gamesCount * rowHeight + blockGap;
  }, 0);
  const { canvas, context } = createExportCanvas(1600, Math.max(1500, height));
  const [homeLogo, awayLogo] = await Promise.all([
    loadExportImage(exportContext.homeTeamLogoUrl),
    loadExportImage(exportContext.awayTeamLogoUrl),
  ]);

  drawSheetExportHeader(context, exportContext, homeLogo, awayLogo);

  let y = 430;
  visibleBlocks.forEach((block) => {
    const games = exportContext.games.filter((game) => block.orders.includes(game.order_number));
    context.shadowColor = "rgba(6, 26, 58, 0.10)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 6;
    context.fillStyle = "#061A3A";
    fillRoundedRect(context, 50, y, 1500, blockHeaderHeight, 8);
    context.shadowColor = "transparent";
    context.fillStyle = "#FFFFFF";
    context.font = "900 34px Arial";
    context.fillText(block.title.toUpperCase(), 78, y + 42);
    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.fillRect(238, y + 17, 2, 30);
    context.fillStyle = "#FFFFFF";
    context.font = "800 26px Arial";
    context.fillText(block.subtitle, 280, y + 41);
    context.font = "800 22px Arial";
    context.textAlign = "center";
    context.fillText("Výkony", 1480, y + 40);
    context.textAlign = "left";
    y += blockHeaderHeight;

    games.forEach((game, index) => {
      const rowY = y + index * rowHeight;
      const homePlayer = playerName(exportContext.homePlayers, game.home_player_ids[0]);
      const awayPlayer = playerName(exportContext.awayPlayers, game.away_player_ids[0]);
      const homeExtra = game.home_player_ids[1] ? ` / ${playerName(exportContext.homePlayers, game.home_player_ids[1])}` : "";
      const awayExtra = game.away_player_ids[1] ? ` / ${playerName(exportContext.awayPlayers, game.away_player_ids[1])}` : "";
      const homeAchievementTotal = exportAchievementTypes.reduce((sum, type) => sum + achievementCount(exportContext.achievements, game.order_number, game.home_player_ids[0], type), 0);
      const awayAchievementTotal = exportAchievementTypes.reduce((sum, type) => sum + achievementCount(exportContext.achievements, game.order_number, game.away_player_ids[0], type), 0);

      context.fillStyle = index % 2 === 0 ? "#FFFFFF" : "#F1F6FC";
      context.fillRect(50, rowY, 1500, rowHeight);
      context.strokeStyle = "#D6E4F2";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(50, rowY);
      context.lineTo(1550, rowY);
      context.stroke();

      context.fillStyle = "#EF233C";
      context.font = "900 25px Arial";
      context.fillText(`${game.order_number}.`, 84, rowY + 36);
      context.fillStyle = "#061A3A";
      context.font = "500 20px Arial";
      context.fillText(exportGameTypeLabels[game.game_type], 150, rowY + 35);
      context.fillStyle = "#061A3A";
      context.font = "800 23px Arial";
      fillWrappedText(context, `${homePlayer}${homeExtra}`, 335, rowY + 34, 360, 24, 1);

      context.fillStyle = "#FFE1E2";
      context.fillRect(712, rowY, 170, rowHeight);
      context.textAlign = "center";
      context.fillStyle = "#EF233C";
      context.font = "900 31px Arial";
      context.fillText(`${game.home_legs} : ${game.away_legs}`, 797, rowY + 37);
      context.fillStyle = "#061A3A";
      context.textAlign = "left";
      context.font = "800 23px Arial";
      fillWrappedText(context, `${awayPlayer}${awayExtra}`, 920, rowY + 34, 420, 24, 1);

      context.strokeStyle = "#D6E4F2";
      context.beginPath();
      context.moveTo(1398, rowY);
      context.lineTo(1398, rowY + rowHeight);
      context.stroke();
      context.fillStyle = "#061A3A";
      context.font = "700 22px Arial";
      context.textAlign = "center";
      context.fillText(`${homeAchievementTotal}  |  ${awayAchievementTotal}`, 1480, rowY + 35);
      context.textAlign = "left";
    });

    context.strokeStyle = "#C8D9EC";
    context.lineWidth = 2;
    context.strokeRect(50, y, 1500, games.length * rowHeight);
    y += games.length * rowHeight + blockGap;
  });

  return canvas;
}

function playedPlayerIds(games: SheetGame[]) {
  return new Set(games.flatMap((game) => [...game.home_player_ids, ...game.away_player_ids]).filter(Boolean));
}

function drawStatisticsExport(exportContext: ExportContext) {
  const visiblePlayerIds = playedPlayerIds(exportContext.games);
  const homeRows = exportContext.homePlayers.filter((player) => visiblePlayerIds.has(player.id));
  const awayRows = exportContext.awayPlayers.filter((player) => visiblePlayerIds.has(player.id));
  const rowHeight = 72;
  const tableHeaderHeight = 64;
  const sectionTitleHeight = 72;
  const sectionGap = 74;
  const tableWidth = 1480;
  const left = 60;
  const height =
    270 +
    sectionTitleHeight +
    tableHeaderHeight +
    Math.max(1, homeRows.length) * rowHeight +
    sectionGap +
    sectionTitleHeight +
    tableHeaderHeight +
    Math.max(1, awayRows.length) * rowHeight +
    120;
  const { canvas, context } = createExportCanvas(1600, Math.max(1300, height));

  context.fillStyle = "#F7FAFE";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(11, 47, 107, 0.08)";
  for (let index = 0; index < 120; index += 1) {
    context.fillRect((index * 83) % 1600, (index * 47) % canvas.height, index % 4 === 0 ? 3 : 2, index % 4 === 0 ? 3 : 2);
  }

  context.fillStyle = "#061A3A";
  context.font = "900 86px Arial";
  context.fillText("Statistiky utkání", left, 120);
  context.strokeStyle = "#0B2F6B";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(left, 178);
  context.lineTo(1540, 178);
  context.stroke();

  function formatDecimal(value: number) {
    return new Intl.NumberFormat("cs-CZ", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(value);
  }

  function drawTable(title: string, players: Player[], startY: number) {
    const columns = [
      { label: "Hráč", width: 315, align: "left" as const },
      { label: "Užitečnost", width: 190, align: "center" as const },
      { label: "OZ", width: 82, align: "center" as const },
      { label: "VZ", width: 82, align: "center" as const },
      { label: "PZ", width: 82, align: "center" as const },
      { label: "OL", width: 82, align: "center" as const },
      { label: "VL", width: 82, align: "center" as const },
      { label: "PL", width: 82, align: "center" as const },
      { label: "95+", width: 90, align: "center" as const },
      { label: "133+", width: 90, align: "center" as const },
      { label: "171+", width: 90, align: "center" as const },
      { label: "Zavření 100+", width: 213, align: "right" as const },
    ];
    const rows = players
      .map((player) => {
        const statistic = exportContext.statistics.find((item) => item.player_id === player.id) ?? {
          player_id: player.id,
          played_matches: 0,
          won_matches: 0,
          lost_matches: 0,
          played_legs: 0,
          won_legs: 0,
          lost_legs: 0,
        };
        const achievements = exportAchievementTypes.map((type) =>
          exportContext.achievements
            .filter((achievement) => achievement.player_id === player.id && achievement.achievement_type === type)
            .reduce((sum, achievement) => sum + achievement.achievement_count, 0),
        );
        const usefulnessScore = calculateUsefulnessScore(
          {
            playedMatches: statistic.played_matches,
            wonMatches: statistic.won_matches,
            wonLegs: statistic.won_legs,
            lostLegs: statistic.lost_legs,
            score95Plus: achievements[exportAchievementTypes.indexOf("score_95_plus")] ?? 0,
            score133Plus: achievements[exportAchievementTypes.indexOf("score_133_plus")] ?? 0,
            score171Plus: achievements[exportAchievementTypes.indexOf("score_171_plus")] ?? 0,
            checkout100Plus: achievements[exportAchievementTypes.indexOf("checkout_100_plus")] ?? 0,
          },
          Math.max(4, statistic.played_matches),
        );

        return { achievements, player, statistic, usefulnessScore };
      })
      .sort((first, second) => {
        const usefulnessDiff = second.usefulnessScore - first.usefulnessScore;
        if (usefulnessDiff !== 0) return usefulnessDiff;

        const winsDiff = second.statistic.won_matches - first.statistic.won_matches;
        if (winsDiff !== 0) return winsDiff;

        const legDiff =
          second.statistic.won_legs -
          second.statistic.lost_legs -
          (first.statistic.won_legs - first.statistic.lost_legs);
        if (legDiff !== 0) return legDiff;

        return first.player.display_name.localeCompare(second.player.display_name, "cs");
      });
    let y = startY;
    context.fillStyle = "#061A3A";
    context.font = "900 46px Arial";
    context.fillText(title, left, y);
    y += sectionTitleHeight;

    context.fillStyle = "#DCEAF8";
    context.fillRect(left, y, tableWidth, tableHeaderHeight);
    context.fillStyle = "#0B2F6B";
    context.font = "900 23px Arial";
    let x = left;
    columns.forEach((column, index) => {
      const textX =
        column.align === "left"
          ? x + 22
          : column.align === "right"
            ? x + column.width - 22
            : x + column.width / 2;
      context.textAlign = column.align;
      context.fillText(column.label, textX, y + 40);
      if (index > 0) {
        context.strokeStyle = "#C8D9EC";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + tableHeaderHeight);
        context.stroke();
      }
      x += column.width;
    });
    context.textAlign = "left";
    y += tableHeaderHeight;

    if (rows.length === 0) {
      context.fillStyle = "#FFFFFF";
      context.fillRect(left, y, tableWidth, rowHeight);
      context.fillStyle = "#64748B";
      context.font = "700 24px Arial";
      context.fillText("V této části nejsou žádní nasazení hráči.", left + 22, y + 45);
      return y + rowHeight;
    }

    rows.forEach(({ achievements, player, statistic, usefulnessScore }, rowIndex) => {
      const values = [
        formatDecimal(usefulnessScore),
        statistic.played_matches,
        statistic.won_matches,
        statistic.lost_matches,
        statistic.played_legs,
        statistic.won_legs,
        statistic.lost_legs,
        ...achievements,
      ];
      context.fillStyle = rowIndex % 2 === 0 ? "#FFFFFF" : "#EFF6FC";
      context.fillRect(left, y, tableWidth, rowHeight);
      context.strokeStyle = "#D6E4F2";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + tableWidth, y);
      context.stroke();
      context.fillStyle = "#061A3A";
      context.font = "900 30px Arial";
      fillWrappedText(context, player.display_name, left + 22, y + 45, columns[0].width - 42, 30, 1);

      x = left + columns[0].width;
      values.forEach((value, index) => {
        const column = columns[index + 1];
        context.fillStyle = index === 0 ? "#EF233C" : "#061A3A";
        context.font = index === 0 ? "900 31px Arial" : "700 29px Arial";
        const textX =
          column.align === "right"
            ? x + column.width - 22
            : column.align === "left"
              ? x + 22
              : x + column.width / 2;
        context.textAlign = column.align;
        context.fillText(String(value), textX, y + 45);
        context.strokeStyle = "#D6E4F2";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + rowHeight);
        context.stroke();
        x += column.width;
      });
      context.textAlign = "left";
      y += rowHeight;
    });

    context.strokeStyle = "#C8D9EC";
    context.lineWidth = 2;
    context.strokeRect(left, startY + sectionTitleHeight, tableWidth, tableHeaderHeight + rows.length * rowHeight);

    return y;
  }

  let y = 255;
  y = drawTable("Domácí hráči", homeRows, y) + sectionGap;
  drawTable("Hostující hráči", awayRows, y);
  return canvas;
}

export default function AdminMatchSheetPage({
  backHref = "/admin/matches",
  backLabel = "Zpět na zápasy",
  scoreboardHref = (currentMatchId) => `/admin/matches/${currentMatchId}/scoreboard`,
  teamView = false,
}: MatchSheetPageProps = {}) {
  const matchId = useParams<{ id: string }>().id;
  const searchParams = useSearchParams();
  const teamSeasonId = searchParams.get("team_season_id");
  const sheetApiParams = new URLSearchParams();
  if (teamView) sheetApiParams.set("view", "team");
  if (teamView && teamSeasonId) sheetApiParams.set("team_season_id", teamSeasonId);
  const sheetApiQuery = sheetApiParams.toString();
  const sheetApiUrl = `/api/admin/matches/${matchId}/sheet${sheetApiQuery ? `?${sheetApiQuery}` : ""}`;
  const [payload, setPayload] = useState(emptyPayload);
  const [rescheduleRequests, setRescheduleRequests] = useState<MatchRescheduleRequest[]>([]);
  const [rescheduleForm, setRescheduleForm] = useState(emptyRescheduleForm);
  const [isRescheduleFormOpen, setIsRescheduleFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [revealingLineup, setRevealingLineup] = useState<{ side: MatchSide; blockNumber: number } | null>(null);
  const [downloadingImage, setDownloadingImage] = useState<"sheet" | "statistics" | null>(null);
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
  const [confirmingSide, setConfirmingSide] = useState<MatchSide | null>(null);
  const [unlockingSide, setUnlockingSide] = useState<MatchSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleNotice, setRescheduleNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(!teamView);
  const [authRefreshKey, setAuthRefreshKey] = useState(0);
  const autosaveRequestId = useRef(0);
  const didAutoOpenRescheduleForm = useRef(false);
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAccessToken = useRef<string | null>(null);

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
  const includeTiebreak = tiebreakNeeded && sheetTiebreakPlayed(payload.games);
  const totalScore = calculateScore(
    payload.games.filter((game) => game.order_number <= 18 || includeTiebreak),
  );
  const confirmationBySide = new Map(
    payload.confirmations.map((confirmation) => [confirmation.side, confirmation]),
  );
  const lockedSides = payload.confirmations.map((confirmation) => confirmation.side);
  const pendingRescheduleRequest = rescheduleRequests.find((request) => request.status === "opponent_pending" || request.status === "pending");
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

  async function loadSheet(options: { showLoading?: boolean; refreshRescheduleRequests?: boolean } = {}) {
    const showLoading = options.showLoading ?? true;
    const refreshRescheduleRequests = options.refreshRescheduleRequests ?? true;
    if (showLoading) setIsLoading(true);
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
      const loadedRequests = refreshRescheduleRequests
        ? await loadRescheduleRequests().catch((requestError) => {
            setError(requestError instanceof Error ? requestError.message : "Žádosti o změnu termínu se nepodařilo načíst.");
            return null;
          })
        : null;
      if (
        refreshRescheduleRequests &&
        new URLSearchParams(window.location.search).get("reschedule") === "1" &&
        body.match &&
        loadedRequests &&
        !didAutoOpenRescheduleForm.current &&
        !loadedRequests.some((request) => request.status === "opponent_pending" || request.status === "pending")
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
    if (showLoading) setIsLoading(false);
  }

  function scheduleRealtimeSheetReload() {
    if (realtimeReloadTimer.current) {
      clearTimeout(realtimeReloadTimer.current);
    }

    realtimeReloadTimer.current = setTimeout(() => {
      realtimeReloadTimer.current = null;
      void loadSheet({ showLoading: false, refreshRescheduleRequests: false });
    }, 300);
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
    setRescheduleNotice({ type: "info", text: teamView ? "Odesílám žádost o změnu termínu..." : "Ukládám nový termín zápasu..." });

    try {
      if (!teamView) {
        const response = await adminFetch(`/api/admin/matches/${payload.match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "change_scheduled_at",
            scheduled_at: requestedScheduledAt.toISOString(),
          }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Termín zápasu se nepodařilo změnit.");
        setRescheduleForm(emptyRescheduleForm);
        setIsRescheduleFormOpen(false);
        await loadSheet();
        setRescheduleNotice({ type: "success", text: "Termín zápasu byl změněn." });
        return;
      }

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
      setRescheduleNotice({
        type: "success",
        text: payload.viewer.canManageBothSides
          ? "Žádost byla odeslána. Teď čeká na schválení moderátorem."
          : "Žádost byla odeslána. Teď čeká na potvrzení soupeřem.",
      });
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

  async function handleUnlockConfirmation(side: MatchSide) {
    setUnlockingSide(side);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/matches/${matchId}/confirm`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      const body = (await response.json().catch(() => ({}))) as SheetPayload;
      if (!response.ok) throw new Error(body.error ?? "Zápis se nepodařilo odemknout.");
      await loadSheet();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Zápis se nepodařilo odemknout.");
    }
    setUnlockingSide(null);
  }

  async function handleRevealLineup(side: MatchSide, blockNumber: number) {
    if (
      payload.viewer.side &&
      !payload.viewer.canManageBothSides &&
      payload.viewer.side !== side &&
      !window.confirm("Opravdu chces zobrazit souperovu soupisku? Tu by mel zverejnit souper")
    ) {
      return;
    }

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
    if (!teamView) {
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        lastAccessToken.current = data.session?.access_token ?? null;
        setIsAuthReady(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const accessToken = session?.access_token ?? null;
      if (accessToken !== lastAccessToken.current) {
        lastAccessToken.current = accessToken;
        setAuthRefreshKey((key) => key + 1);
      }
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [teamView]);

  useEffect(() => {
    if (teamView && !isAuthReady) return;
    // Initial data is loaded when the dynamic match route or auth session changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, sheetApiUrl, teamView, isAuthReady, authRefreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel(`match-sheet:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_games", filter: `match_id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_game_achievements", filter: `match_id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_player_slots", filter: `match_id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_block_lineup_reveals", filter: `match_id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_confirmations", filter: `match_id=eq.${matchId}` },
        scheduleRealtimeSheetReload,
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
        realtimeReloadTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
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

  async function handleDownloadImage(kind: "sheet" | "statistics") {
    if (!payload.match) return;
    setDownloadingImage(kind);
    setError(null);

    try {
      const exportGames = payload.games.filter((game) => game.order_number <= 18 || includeTiebreak);
      const exportContext: ExportContext = {
        achievements: payload.achievements,
        awayPlayers,
        awayTeamLogoUrl,
        awayTeamName,
        games: exportGames,
        homePlayers,
        homeTeamLogoUrl,
        homeTeamName,
        leagueLabel: [payload.season?.name, payload.league?.name, payload.group?.name].filter(Boolean).join(" / "),
        matchDateLabel: formatDateTime(payload.match.scheduled_at),
        score: totalScore,
        statistics: payload.statistics,
      };
      const fileBase = sanitizeFilePart(`${homeTeamName}-${awayTeamName}-${formatDateTime(payload.match.scheduled_at)}`);
      if (kind === "sheet") {
        await downloadCanvasAsJpeg(await drawMatchSheetExport(exportContext), `${fileBase}-zapis.jpg`);
      } else {
        await downloadCanvasAsJpeg(drawStatisticsExport(exportContext), `${fileBase}-statistiky.jpg`);
      }
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Obrázek se nepodařilo stáhnout jako JPG.");
    } finally {
      setDownloadingImage(null);
    }
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
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={downloadingImage !== null}
            isLoading={downloadingImage === "sheet"}
            onClick={() => void handleDownloadImage("sheet")}
            type="button"
            variant="secondary"
          >
            {downloadingImage === "sheet" ? "Stahuji zápis..." : "Stáhnout zápis JPG"}
          </Button>
          <Button
            disabled={downloadingImage !== null}
            isLoading={downloadingImage === "statistics"}
            onClick={() => void handleDownloadImage("statistics")}
            type="button"
            variant="secondary"
          >
            {downloadingImage === "statistics" ? "Stahuji statistiky..." : "Stáhnout statistiky JPG"}
          </Button>
          {scoreboardHref ? (
            <Link
              className="inline-flex w-fit items-center justify-center rounded-2xl bg-[#EF233C] px-5 py-3 text-sm font-bold !text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              href={scoreboardHref(matchId)}
            >
              Otevřít počítadlo
            </Link>
          ) : null}
        </div>
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
                {pendingRescheduleRequest.status === "opponent_pending" ? "Čeká žádost na potvrzení soupeřem" : "Čeká žádost na schválení moderátorem"}: {formatDateTime(pendingRescheduleRequest.requested_scheduled_at)}.
              </p>
            ) : null}
          </div>
          <Button
            disabled={teamView && Boolean(pendingRescheduleRequest)}
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
            {teamView ? (
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--brand-navy)]">
                Důvod
                <textarea
                  className="min-h-24 rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-blue)]"
                  required
                  value={rescheduleForm.reason}
                  onChange={(event) => setRescheduleForm((current) => ({ ...current, reason: event.target.value }))}
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!rescheduleForm.requested_scheduled_at || (teamView && !rescheduleForm.reason.trim())}
                isLoading={isSubmittingReschedule}
                onClick={() => void handleRescheduleRequest()}
                type="button"
              >
                {isSubmittingReschedule ? (teamView ? "Odesílám..." : "Ukládám...") : teamView ? "Odeslat žádost" : "Uložit termín"}
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
          lineupsVisibleForAll={payload.match?.status === "confirmed"}
          lockedSides={lockedSides}
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
                  ) : payload.viewer.canManageBothSides ? (
                    <div className="mt-4">
                      <Button
                        disabled={unlockingSide !== null}
                        onClick={() => void handleUnlockConfirmation(side)}
                        type="button"
                        variant="secondary"
                      >
                        {unlockingSide === side ? "Odemykám..." : "Odemknout"}
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
            games={payload.games}
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
