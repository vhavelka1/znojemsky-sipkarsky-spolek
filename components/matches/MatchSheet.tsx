import { ReactNode } from "react";
import { Card } from "@/components/ui/admin";

export type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
export type MatchGameType = "singles" | "doubles" | "cricket" | "tiebreak_701";
export type MatchSide = "home" | "away";
export type HomeSlotCode = "1" | "2" | "3" | "4";
export type AwaySlotCode = "A" | "B" | "C" | "D";
export type SlotCode = HomeSlotCode | AwaySlotCode;
export type AchievementType =
  | "score_95_plus"
  | "score_133_plus"
  | "score_171_plus"
  | "checkout_100_plus";

export type SheetGame = {
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

export type SheetAchievement = {
  id?: string;
  match_game_id?: string | null;
  order_number?: number;
  player_id: string;
  achievement_type: AchievementType;
  achievement_count: number;
};

export type Player = { id: string; display_name: string };
export type Score = { home_points: number; away_points: number; home_legs: number; away_legs: number };

type Block = {
  title: string;
  subtitle: string;
  orders: number[];
  highlighted?: boolean;
};

type MatchSheetProps = {
  achievements: SheetAchievement[];
  awayPlayers: Player[];
  games: SheetGame[];
  homePlayers: Player[];
  playerLabel?: (player: Player) => string;
  readOnly?: boolean;
  error?: string | null;
  onAchievementChange?: (orderNumber: number, playerId: string, type: AchievementType, count: number) => void;
  onLegsChange?: (game: SheetGame, side: "home_legs" | "away_legs", value: number) => void;
  onPairSlotChange?: (game: SheetGame, side: MatchSide, index: number, slotCode: string) => void;
  onPlayerChange?: (game: SheetGame, side: MatchSide, index: number, playerId: string) => void;
  onPlayerFocus?: (game: SheetGame, side: MatchSide, index: number) => void;
  playerUsesDifferentSlot?: (side: MatchSide, slotCode: SlotCode, playerId: string) => boolean;
};

type MatchStatisticsProps = {
  achievements: SheetAchievement[];
  homePlayers: Player[];
  awayPlayers: Player[];
  statistics: Array<{
    player_id: string;
    played_matches: number;
    won_matches: number;
    lost_matches: number;
    played_legs: number;
    won_legs: number;
    lost_legs: number;
  }>;
  playerLabel?: (player: Player) => string;
};

export const statusLabels: Record<MatchStatus, string> = {
  scheduled: "naplánováno",
  played: "odehráno",
  awaiting_confirmation: "čeká na potvrzení",
  confirmed: "potvrzeno",
  cancelled: "zrušeno",
};

export const gameTypeLabels: Record<MatchGameType, string> = {
  singles: "Dvouhra",
  doubles: "Čtyřhra",
  cricket: "Kriket",
  tiebreak_701: "Rozstřel 701 DO",
};

export const achievementLabels: Record<AchievementType, string> = {
  score_95_plus: "95+",
  score_133_plus: "133+",
  score_171_plus: "171+",
  checkout_100_plus: "Zavření 100+",
};

export const achievementTypes = Object.keys(achievementLabels) as AchievementType[];
export const paperAchievementTypes: AchievementType[] = [
  "score_171_plus",
  "score_133_plus",
  "score_95_plus",
  "checkout_100_plus",
];
export const homeSlotCodes: HomeSlotCode[] = ["1", "2", "3", "4"];
export const awaySlotCodes: AwaySlotCode[] = ["A", "B", "C", "D"];
export const singlesSlotPairs = new Map<number, [HomeSlotCode, AwaySlotCode]>([
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

const inputClass =
  "rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--brand-navy)] outline-none focus:border-[var(--brand-blue)]";

export function playerLimitForGame(gameType: MatchGameType) {
  return gameType === "singles" ? 1 : 2;
}

export function normalizeGame(game: SheetGame): SheetGame {
  const limit = playerLimitForGame(game.game_type);

  return {
    ...game,
    home_player_ids: game.home_player_ids.slice(0, limit),
    away_player_ids: game.away_player_ids.slice(0, limit),
    home_slot_codes: game.home_slot_codes.slice(0, limit),
    away_slot_codes: game.away_slot_codes.slice(0, limit),
  };
}

export function getWinner(game: Pick<SheetGame, "game_type" | "home_legs" | "away_legs">) {
  const winningLegs = game.game_type === "tiebreak_701" ? 1 : 3;
  if (game.home_legs === winningLegs && game.away_legs < winningLegs) return "home";
  if (game.away_legs === winningLegs && game.home_legs < winningLegs) return "away";
  return null;
}

export function calculateScore(games: SheetGame[]): Score {
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

export function sheetTiebreakNeeded(games: SheetGame[]) {
  const coreScore = calculateScore(games.filter((game) => game.order_number <= 18));
  return coreScore.home_points === 9 && coreScore.away_points === 9;
}

function defaultPlayerLabel(player: Player) {
  return player.display_name;
}

function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <span className="block min-h-8 rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--brand-navy)]">
      {children || "-"}
    </span>
  );
}

export function MatchInfo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--brand-navy)]">{children}</p>
    </div>
  );
}

export function MatchSheet({
  achievements,
  awayPlayers,
  games,
  homePlayers,
  playerLabel = defaultPlayerLabel,
  readOnly = false,
  onAchievementChange,
  onLegsChange,
  onPairSlotChange,
  onPlayerChange,
  onPlayerFocus,
  playerUsesDifferentSlot = () => false,
}: MatchSheetProps) {
  const tiebreakNeeded = sheetTiebreakNeeded(games);
  const visibleBlocks = tiebreakNeeded ? [...blocks, tiebreakBlock] : blocks;

  function achievementCount(orderNumber: number, playerId: string, type: AchievementType) {
    return achievements.find(
      (achievement) =>
        achievement.order_number === orderNumber &&
        achievement.player_id === playerId &&
        achievement.achievement_type === type,
    )?.achievement_count ?? 0;
  }

  function renderAchievementCell(game: SheetGame, side: MatchSide, type: AchievementType) {
    if (game.game_type !== "singles") return <span className="block text-center text-[var(--admin-muted)]">-</span>;
    const playerId = (side === "home" ? game.home_player_ids : game.away_player_ids)[0] ?? "";
    const value = playerId ? achievementCount(game.order_number, playerId, type) : 0;

    if (readOnly) return <span className="block text-center text-xs font-bold text-[var(--brand-navy)]">{value || "-"}</span>;

    return (
      <input
        aria-label={`${achievementLabels[type]} ${side === "home" ? "domácí" : "hosté"} 1`}
        className="h-8 w-8 rounded-md border border-[var(--admin-border)] bg-white px-0.5 text-center text-xs outline-none focus:border-[var(--brand-blue)] disabled:bg-slate-50"
        disabled={!playerId}
        inputMode="numeric"
        pattern="[0-9]*"
        type="text"
        value={playerId ? value : 0}
        onChange={(event) =>
          onAchievementChange?.(
            game.order_number,
            playerId,
            type,
            Number(event.target.value.replace(/[^0-9]/g, "") || 0),
          )
        }
      />
    );
  }

  function renderAssignedPlayer(game: SheetGame, side: MatchSide, slotCode: SlotCode) {
    const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
    const players = side === "home" ? homePlayers : awayPlayers;
    const selectedPlayer = players.find((player) => player.id === playerIds[0]);

    return (
      <div className="grid grid-cols-[22px_1fr] items-center gap-1">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[var(--admin-soft-blue)] px-1 text-[11px] font-bold text-[var(--brand-navy)]">
          {slotCode}
        </span>
        {readOnly ? (
          <ReadOnlyValue>{selectedPlayer ? playerLabel(selectedPlayer) : ""}</ReadOnlyValue>
        ) : (
          <select
            className={`${inputClass} min-w-0 px-2 py-1.5 text-xs`}
            value={playerIds[0] ?? ""}
            onFocus={() => onPlayerFocus?.(game, side, 0)}
            onChange={(event) => onPlayerChange?.(game, side, 0, event.target.value)}
          >
            <option value="">Vyberte hráče</option>
            {players
              .filter((player) => player.id === playerIds[0] || !playerUsesDifferentSlot(side, slotCode, player.id))
              .map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}
          </select>
        )}
      </div>
    );
  }

  function renderPairSlots(game: SheetGame, side: MatchSide) {
    const allSlotCodes = side === "home" ? homeSlotCodes : awaySlotCodes;
    const selectedCodes = side === "home" ? game.home_slot_codes : game.away_slot_codes;
    const playerIds = side === "home" ? game.home_player_ids : game.away_player_ids;
    const players = side === "home" ? homePlayers : awayPlayers;

    return (
      <div className="grid gap-2">
        {[0, 1].map((index) => {
          const selectedCode = selectedCodes[index] ?? "";
          const selectedPlayer = players.find((player) => player.id === playerIds[index]);

          if (readOnly) {
            return (
              <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-1" key={index}>
                <span className="text-center text-[11px] font-bold text-[var(--admin-muted)]">{selectedCode || "-"}</span>
                <ReadOnlyValue>{selectedPlayer ? playerLabel(selectedPlayer) : ""}</ReadOnlyValue>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-[18px_72px_minmax(0,1fr)] items-center gap-1" key={index}>
              <span className="text-center text-[11px] font-bold text-[var(--admin-muted)]">{index + 1}.</span>
              <select
                aria-label={`${side === "home" ? "Domácí" : "Hosté"} pozice ${index + 1}`}
                className={`${inputClass} min-w-0 px-1 py-1 text-[11px]`}
                value={selectedCode}
                onChange={(event) => onPairSlotChange?.(game, side, index, event.target.value)}
              >
                <option value="">Pozice</option>
                {allSlotCodes.map((slotCode) => <option key={slotCode} value={slotCode}>{slotCode}</option>)}
              </select>
              <select
                aria-label={`${side === "home" ? "Domácí" : "Hosté"} hráč ${index + 1}`}
                className={`${inputClass} min-w-0 px-1 py-1 text-[11px]`}
                value={playerIds[index] ?? ""}
                onFocus={() => onPlayerFocus?.(game, side, index)}
                onChange={(event) => onPlayerChange?.(game, side, index, event.target.value)}
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

  function renderLegs(game: SheetGame) {
    if (readOnly) return <span className="block text-center text-sm font-black text-[var(--brand-navy)]">{game.home_legs}:{game.away_legs}</span>;

    const maximumLegs = game.game_type === "tiebreak_701" ? 1 : 3;
    const legsPattern = game.game_type === "tiebreak_701" ? "[0-1]" : "[0-3]";

    return (
      <div className="grid grid-cols-[46px_8px_46px] items-center justify-center gap-0.5">
        <input className={`${inputClass} h-8 w-full px-1 py-0 text-center text-sm font-semibold`} inputMode="numeric" maxLength={1} pattern={legsPattern} type="text" value={game.home_legs} onChange={(event) => onLegsChange?.(game, "home_legs", Number(event.target.value.replace(maximumLegs === 1 ? /[^0-1]/g : /[^0-3]/g, "") || 0))} />
        <span className="text-center">:</span>
        <input className={`${inputClass} h-8 w-full px-1 py-0 text-center text-sm font-semibold`} inputMode="numeric" maxLength={1} pattern={legsPattern} type="text" value={game.away_legs} onChange={(event) => onLegsChange?.(game, "away_legs", Number(event.target.value.replace(maximumLegs === 1 ? /[^0-1]/g : /[^0-3]/g, "") || 0))} />
      </div>
    );
  }

  function renderGame(game: SheetGame) {
    const pairGame = game.game_type !== "singles";
    const fixedPair = singlesSlotPairs.get(game.order_number);

    return (
      <tr className="border-t border-[var(--admin-border)]" key={game.order_number}>
        <td className="px-1 py-3 text-center text-xs font-bold text-[var(--brand-navy)]">
          {fixedPair ? `${game.order_number}.` : `${game.order_number}. ${gameTypeLabels[game.game_type]}`}
        </td>
        {paperAchievementTypes.map((type) => (
          <td className="px-0.5 py-2" key={`home:${type}`}>{renderAchievementCell(game, "home", type)}</td>
        ))}
        <td className="px-1 py-3">
          {pairGame ? renderPairSlots(game, "home") : fixedPair ? renderAssignedPlayer(game, "home", fixedPair[0]) : null}
        </td>
        <td className="px-1 py-3 text-center text-[11px] font-bold text-[var(--brand-blue)]">
          {fixedPair ? `${fixedPair[0]}:${fixedPair[1]}` : gameTypeLabels[game.game_type]}
        </td>
        <td className="px-1 py-3">
          {pairGame ? renderPairSlots(game, "away") : fixedPair ? renderAssignedPlayer(game, "away", fixedPair[1]) : null}
        </td>
        {paperAchievementTypes.map((type) => (
          <td className="px-0.5 py-2" key={`away:${type}`}>{renderAchievementCell(game, "away", type)}</td>
        ))}
        <td className="px-1 py-3">{renderLegs(game)}</td>
        <td className="px-1 py-3 text-center text-xs font-bold text-[var(--brand-navy)]">
          {getWinner(game) === "home" ? "1:0" : getWinner(game) === "away" ? "0:1" : "-"}
        </td>
      </tr>
    );
  }

  function renderBlock(block: Block) {
    const blockGames = games.filter((game) => block.orders.includes(game.order_number));
    const score = calculateScore(games.filter((game) => game.order_number <= Math.max(...block.orders)));

    return (
      <Card className={`overflow-hidden p-0 ${block.highlighted ? "border-[#E2C57A] bg-[#fffdf7]" : ""}`}>
        <div className={`flex flex-col gap-3 border-b border-[var(--admin-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${block.highlighted ? "bg-[#fbf6e8]" : "bg-white"}`}>
          <div>
            <p className="text-xs font-bold text-[var(--brand-blue)]">{block.title}</p>
            <h3 className="mt-1 text-lg font-bold text-[var(--brand-navy)]">{block.subtitle}</h3>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <span><strong>Průběžný stav:</strong> {score.home_points}:{score.away_points}</span>
            <span><strong>Legy:</strong> {score.home_legs}:{score.away_legs}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed text-left text-xs">
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
            <tbody>{blockGames.map(renderGame)}</tbody>
          </table>
        </div>
      </Card>
    );
  }

  return <div className="flex flex-col gap-6">{visibleBlocks.map((block) => <div key={block.title}>{renderBlock(block)}</div>)}</div>;
}

export function MatchStatisticsSection({
  achievements,
  awayPlayers,
  homePlayers,
  playerLabel = defaultPlayerLabel,
  statistics,
}: MatchStatisticsProps) {
  function statisticRows(players: Player[]) {
    return players.map((player) => {
      const statistic = statistics.find((item) => item.player_id === player.id) ?? { played_matches: 0, won_matches: 0, lost_matches: 0, played_legs: 0, won_legs: 0, lost_legs: 0 };
      const totals = achievementTypes.map((type) => achievements.filter((item) => item.player_id === player.id && item.achievement_type === type).reduce((sum, item) => sum + item.achievement_count, 0));
      return (
        <tr className="border-t border-[var(--admin-border)]" key={player.id}>
          <td className="px-3 py-3 font-medium">{playerLabel(player)}</td>
          <td className="px-3 py-3 text-right">{statistic.played_matches}</td>
          <td className="px-3 py-3 text-right">{statistic.won_matches}</td>
          <td className="px-3 py-3 text-right">{statistic.lost_matches}</td>
          <td className="px-3 py-3 text-right">{statistic.played_legs}</td>
          <td className="px-3 py-3 text-right">{statistic.won_legs}</td>
          <td className="px-3 py-3 text-right">{statistic.lost_legs}</td>
          {totals.map((total, index) => <td className="px-3 py-3 text-right" key={achievementTypes[index]}>{total}</td>)}
        </tr>
      );
    });
  }

  function statisticsTable(title: string, players: Player[]) {
    return (
      <div>
        <h4 className="font-bold text-[var(--brand-navy)]">{title}</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[900px] text-left text-sm">
            <thead className="bg-[var(--admin-soft-blue)] text-[var(--admin-muted)]">
              <tr>
                <th className="px-3 py-3">Hráč</th>
                {["OZ", "VZ", "PZ", "OL", "VL", "PL", "95+", "133+", "171+", "Zavření 100+"].map((label) => <th className="px-3 py-3 text-right" key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>{statisticRows(players)}</tbody>
          </table>
        </div>
      </div>
    );
  }

  return <div className="mt-5 grid gap-7">{statisticsTable("Domácí hráči", homePlayers)}{statisticsTable("Hostující hráči", awayPlayers)}</div>;
}
