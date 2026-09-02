"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculateScore,
  MatchInfo,
  MatchSheet,
  MatchStatisticsSection,
  sheetTiebreakNeeded,
  statusLabels,
  type MatchStatus,
  type Player,
  type SheetAchievement,
  type SheetGame,
} from "@/components/matches/MatchSheet";
import { PublicFooter, PublicHeader } from "@/components/public/PublicShell";

type NamedEntity = { id: string; name: string };
type TeamSeason = { id: string; team_id: string; season_id: string; display_name: string | null };
type Team = { id: string; name: string; logo_url: string | null };
type Membership = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
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
type MatchDetail = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  round_number: number | null;
  scheduled_at: string;
  played_at: string | null;
  status: MatchStatus;
};
type DetailPayload = {
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
  error?: string;
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
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function TeamHeading({
  label,
  logoUrl,
  name,
  score,
}: {
  label: string;
  logoUrl: string | null;
  name: string;
  score: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-white p-1.5 shadow-sm">
        {logoUrl ? (
          <Image alt={`Logo ${name}`} className="h-full w-full object-contain" height={56} src={logoUrl} unoptimized width={56} />
        ) : (
          <span className="text-lg font-black text-[#0B2F6B]">{name.charAt(0)}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-slate-500">{label}</p>
        <p className="truncate text-lg font-black text-[#061A3A]">{name}</p>
      </div>
      <p className="ml-auto text-4xl font-black text-[#061A3A]">{score}</p>
    </div>
  );
}

export default function PublicMatchDetailPage() {
  const matchId = useParams<{ id: string }>().id;
  const [payload, setPayload] = useState(emptyPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch(`/api/public/matches/${matchId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as DetailPayload;
        if (!response.ok) throw new Error(body.error ?? "Zápis utkání se nepodařilo načíst.");
        if (!isMounted) return;

        setPayload({
          match: body.match ?? null,
          season: body.season ?? null,
          league: body.league ?? null,
          group: body.group ?? null,
          teamSeasons: body.teamSeasons ?? [],
          teams: body.teams ?? [],
          memberships: body.memberships ?? [],
          players: body.players ?? [],
          games: body.games ?? [],
          achievements: body.achievements ?? [],
          statistics: body.statistics ?? [],
        });
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Zápis utkání se nepodařilo načíst.");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [matchId]);

  const teamById = useMemo(() => new Map(payload.teams.map((team) => [team.id, team])), [payload.teams]);
  const teamSeasonById = useMemo(() => new Map(payload.teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])), [payload.teamSeasons]);
  const playerById = useMemo(() => new Map(payload.players.map((player) => [player.id, player])), [payload.players]);
  const homeTeamSeason = payload.match ? teamSeasonById.get(payload.match.home_team_id) : undefined;
  const awayTeamSeason = payload.match ? teamSeasonById.get(payload.match.away_team_id) : undefined;
  const homeTeam = homeTeamSeason ? teamById.get(homeTeamSeason.team_id) : undefined;
  const awayTeam = awayTeamSeason ? teamById.get(awayTeamSeason.team_id) : undefined;
  const homeTeamName = homeTeamSeason?.display_name || homeTeam?.name || "Domácí";
  const awayTeamName = awayTeamSeason?.display_name || awayTeam?.name || "Hosté";
  const homePlayers = payload.memberships
    .filter((membership) => membership.team_season_id === payload.match?.home_team_id)
    .map((membership) => playerById.get(membership.player_id))
    .filter((player): player is Player => Boolean(player));
  const awayPlayers = payload.memberships
    .filter((membership) => membership.team_season_id === payload.match?.away_team_id)
    .map((membership) => playerById.get(membership.player_id))
    .filter((player): player is Player => Boolean(player));
  const tiebreakNeeded = sheetTiebreakNeeded(payload.games);
  const score = calculateScore(payload.games.filter((game) => game.order_number <= 18 || tiebreakNeeded));

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader activeHref="/zapasy" />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#061A3A_0%,#0B2F6B_58%,#061A3A_100%)]" />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <Link className="text-sm font-black text-blue-100 transition hover:text-white" href="/zapasy">
            Zpět na zápasy
          </Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
            {payload.match?.round_number ? `${payload.match.round_number}. kolo` : "Zápis utkání"}
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            {homeTeamName} vs. {awayTeamName}
          </h1>
          <p className="mt-3 text-lg font-bold text-blue-100">
            {payload.match ? formatDateTime(payload.match.scheduled_at) : "Načítám zápis utkání"}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="rounded-[24px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_18px_48px_rgba(6,26,58,0.08)]">
            Načítám zápis utkání...
          </div>
        ) : error || !payload.match ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-5 text-sm font-bold text-red-700">
            {error ?? "Zápas nebyl nalezen."}
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            <section className="rounded-[24px] border border-[#D8E4F2] bg-white p-5 shadow-[0_18px_48px_rgba(6,26,58,0.08)] sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                <TeamHeading label="Domácí" logoUrl={homeTeam?.logo_url ?? null} name={homeTeamName} score={score.home_points} />
                <div className="rounded-2xl bg-[#061A3A] px-5 py-3 text-center text-2xl font-black text-white">
                  {score.home_points}:{score.away_points}
                </div>
                <TeamHeading label="Hosté" logoUrl={awayTeam?.logo_url ?? null} name={awayTeamName} score={score.away_points} />
              </div>
              <div className="mt-6 grid gap-5 border-t border-[#D8E4F2] pt-5 md:grid-cols-4">
                <MatchInfo label="Soutěž">{payload.season?.name} / {payload.league?.name} / {payload.group?.name}</MatchInfo>
                <MatchInfo label="Datum">{formatDateTime(payload.match.scheduled_at)}</MatchInfo>
                <MatchInfo label="Stav">{statusLabels[payload.match.status]}</MatchInfo>
                <MatchInfo label="Legy">{score.home_legs}:{score.away_legs}</MatchInfo>
              </div>
            </section>

            <MatchSheet
              achievements={payload.achievements}
              awayPlayers={awayPlayers}
              games={payload.games}
              homePlayers={homePlayers}
              readOnly
            />

            <section className="rounded-[24px] border border-[#D8E4F2] bg-white p-5 shadow-[0_18px_48px_rgba(6,26,58,0.08)] sm:p-6">
              <h2 className="text-xl font-black text-[#061A3A]">Statistiky</h2>
              <MatchStatisticsSection
                achievements={payload.achievements}
                awayPlayers={awayPlayers}
                homePlayers={homePlayers}
                statistics={payload.statistics}
              />
            </section>
          </div>
        )}
      </section>

      <PublicFooter />
    </main>
  );
}
