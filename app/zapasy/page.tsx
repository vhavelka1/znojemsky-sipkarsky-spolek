"use client";

import Image from "next/image";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public/PublicShell";
import { useEffect, useMemo, useState } from "react";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type League = {
  id: string;
  season_id: string;
  name: string;
};

type LeagueGroup = {
  id: string;
  league_id: string;
  name: string;
  sort_order: number;
};

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";

type MatchTeam = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
  venue: string | null;
};

type PublicMatch = {
  id: string;
  groupId: string;
  roundNumber: number | null;
  scheduledAt: string;
  playedAt: string | null;
  status: MatchStatus;
  venue: string | null;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  result: {
    homePoints: number;
    awayPoints: number;
  } | null;
};

type PublicMatchBye = {
  roundNumber: number;
  team: MatchTeam;
};

type MatchesPayload = {
  seasons?: Season[];
  leagues?: League[];
  groups?: LeagueGroup[];
  selected?: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    teamSeasonId: string;
  };
  teams?: MatchTeam[];
  matches?: PublicMatch[];
  byes?: PublicMatchBye[];
  hasGroupsForSelectedLeague?: boolean;
  error?: string;
};

type Filters = {
  seasonId: string;
  leagueId: string;
  groupId: string;
  teamSeasonId: string;
};

type ViewMode = "rounds" | "team";
type MatchSideFilter = "all" | "home" | "away";

type RoundSection = {
  roundNumber: number | null;
  label: string;
  dateRange: string | null;
  matches: PublicMatch[];
  byes: PublicMatchBye[];
};

type TeamProgramItem =
  | {
      type: "match";
      roundNumber: number | null;
      scheduledAt: string;
      id: string;
      match: PublicMatch;
    }
  | {
      type: "bye";
      roundNumber: number;
      scheduledAt: null;
      id: string;
      bye: PublicMatchBye;
    };

const emptyFilters: Filters = {
  seasonId: "",
  leagueId: "",
  groupId: "",
  teamSeasonId: "",
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: "Naplánováno",
  played: "Odehráno",
  awaiting_confirmation: "Čeká na potvrzení",
  confirmed: "Potvrzeno",
  cancelled: "Zrušeno",
};

const statusClassNames: Record<MatchStatus, string> = {
  scheduled: "bg-[#EAF2FF] text-[#0B2F6B]",
  played: "bg-emerald-50 text-emerald-700",
  awaiting_confirmation: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-[#EF233C]",
};

function initialFiltersFromUrl(): Filters {
  if (typeof window === "undefined") return emptyFilters;

  const params = new URLSearchParams(window.location.search);
  return {
    seasonId: params.get("season_id") ?? "",
    leagueId: params.get("league_id") ?? "",
    groupId: params.get("group_id") ?? "",
    teamSeasonId: params.get("team_season_id") ?? "",
  };
}

function viewModeFromParams(params: URLSearchParams): ViewMode {
  const view = params.get("view");
  if (view === "team" || view === "rounds") return view;
  return params.get("team_season_id") ? "team" : "rounds";
}

function initialViewModeFromUrl(): ViewMode {
  if (typeof window === "undefined") return "rounds";

  return viewModeFromParams(new URLSearchParams(window.location.search));
}

function sideFilterFromParams(params: URLSearchParams): MatchSideFilter {
  const side = params.get("side");
  if (side === "home" || side === "away") return side;
  return "all";
}

function initialSideFilterFromUrl(): MatchSideFilter {
  if (typeof window === "undefined") return "all";

  const params = new URLSearchParams(window.location.search);
  return params.get("team_season_id") ? sideFilterFromParams(params) : "all";
}

function updateUrl(filters: Filters, viewMode: ViewMode, sideFilter: MatchSideFilter) {
  const params = new URLSearchParams();
  if (filters.seasonId) params.set("season_id", filters.seasonId);
  if (filters.leagueId) params.set("league_id", filters.leagueId);
  if (filters.groupId) params.set("group_id", filters.groupId);
  if (filters.teamSeasonId) params.set("team_season_id", filters.teamSeasonId);
  params.set("view", viewMode);
  if (filters.teamSeasonId && sideFilter !== "all") params.set("side", sideFilter);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `/zapasy?${query}` : "/zapasy");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRoundRange(matches: PublicMatch[]) {
  const timestamps = matches
    .map((match) => new Date(match.scheduledAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((first, second) => first - second);

  if (timestamps.length === 0) return null;

  const first = new Date(timestamps[0]);
  const last = new Date(timestamps[timestamps.length - 1]);
  if (first.toDateString() === last.toDateString()) return formatDate(first.toISOString());

  return `${formatDate(first.toISOString())} - ${formatDate(last.toISOString())}`;
}

function TeamLogo({
  compact = false,
  name,
  logoUrl,
}: {
  compact?: boolean;
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${compact ? "h-10 w-10 rounded-xl p-1.5" : "h-14 w-14 rounded-2xl p-1.5"} flex shrink-0 items-center justify-center overflow-hidden border border-[#D8E4F2] bg-white shadow-sm`}>
        {logoUrl ? (
          <Image
            alt={`Logo ${name}`}
            className="h-full w-full object-contain"
            height={56}
            src={logoUrl}
            unoptimized
            width={56}
          />
        ) : (
          <span className="text-base font-black text-[#0B2F6B]">{name.charAt(0)}</span>
        )}
      </div>
      <p className={`${compact ? "text-sm" : "text-base"} min-w-0 truncate font-black leading-tight text-[#061A3A]`}>{name}</p>
    </div>
  );
}

function groupMatchesByRound(matches: PublicMatch[], byes: PublicMatchBye[]): RoundSection[] {
  const sections = new Map<string, PublicMatch[]>();
  const byesByRound = new Map<number, PublicMatchBye[]>();

  matches.forEach((match) => {
    const key = match.roundNumber === null ? "without-round" : String(match.roundNumber);
    sections.set(key, [...(sections.get(key) ?? []), match]);
  });

  byes.forEach((bye) => {
    byesByRound.set(bye.roundNumber, [...(byesByRound.get(bye.roundNumber) ?? []), bye]);
    const key = String(bye.roundNumber);
    if (!sections.has(key)) sections.set(key, []);
  });

  return Array.from(sections.entries())
    .map(([key, roundMatches]) => {
      const roundNumber = key === "without-round" ? null : Number(key);
      return {
        roundNumber,
        label: roundNumber === null ? "Bez určeného kola" : `${roundNumber}. kolo`,
        dateRange: formatRoundRange(roundMatches),
        matches: [...roundMatches].sort((first, second) => {
          const dateDifference = new Date(first.scheduledAt).getTime() - new Date(second.scheduledAt).getTime();
          if (dateDifference !== 0) return dateDifference;
          return first.id.localeCompare(second.id);
        }),
        byes: roundNumber === null ? [] : byesByRound.get(roundNumber) ?? [],
      };
    })
    .sort((first, second) => {
      const firstRound = first.roundNumber ?? Number.MAX_SAFE_INTEGER;
      const secondRound = second.roundNumber ?? Number.MAX_SAFE_INTEGER;
      return firstRound - secondRound;
    });
}

function buildTeamProgram(matches: PublicMatch[], byes: PublicMatchBye[]): TeamProgramItem[] {
  return [
    ...matches.map((match) => ({
      type: "match" as const,
      roundNumber: match.roundNumber,
      scheduledAt: match.scheduledAt,
      id: match.id,
      match,
    })),
    ...byes.map((bye) => ({
      type: "bye" as const,
      roundNumber: bye.roundNumber,
      scheduledAt: null,
      id: `bye:${bye.roundNumber}:${bye.team.teamSeasonId}`,
      bye,
    })),
  ].sort((first, second) => {
    const firstRound = first.roundNumber ?? Number.MAX_SAFE_INTEGER;
    const secondRound = second.roundNumber ?? Number.MAX_SAFE_INTEGER;
    if (firstRound !== secondRound) return firstRound - secondRound;

    const firstTime = first.scheduledAt ? new Date(first.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    const secondTime = second.scheduledAt ? new Date(second.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (firstTime !== secondTime) return firstTime - secondTime;

    return first.id.localeCompare(second.id);
  });
}

function filterTeamProgramBySide(
  program: TeamProgramItem[],
  selectedTeamSeasonId: string,
  sideFilter: MatchSideFilter,
) {
  if (sideFilter === "all") return program;

  return program.filter((item) => {
    if (item.type === "bye") return false;
    if (sideFilter === "home") return item.match.homeTeam.teamSeasonId === selectedTeamSeasonId;
    return item.match.awayTeam.teamSeasonId === selectedTeamSeasonId;
  });
}

function ResultBadge({ match }: { match: PublicMatch }) {
  if (match.result) {
    return (
      <div className="inline-flex h-9 min-w-14 items-center justify-center rounded-lg bg-[#061A3A] px-3 text-center text-white shadow-sm">
        <p className="text-sm font-black leading-none">
          {match.result.homePoints}:{match.result.awayPoints}
        </p>
      </div>
    );
  }

  return (
    <div className="inline-flex h-9 min-w-14 items-center justify-center rounded-lg bg-[#061A3A] px-3 text-center text-white shadow-sm">
      <p className="text-sm font-black leading-none">VS</p>
    </div>
  );
}

async function fetchMatches(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.seasonId) params.set("season_id", filters.seasonId);
  if (filters.leagueId) params.set("league_id", filters.leagueId);
  if (filters.groupId) params.set("group_id", filters.groupId);
  if (filters.teamSeasonId) params.set("team_season_id", filters.teamSeasonId);

  const response = await fetch(`/api/public/matches?${params.toString()}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as MatchesPayload;
  if (!response.ok) throw new Error(body.error ?? "Zápasy se nepodařilo načíst.");
  return body;
}

function MatchRow({ match }: { match: PublicMatch }) {
  return (
    <article className="grid gap-3 md:grid-cols-[minmax(0,1fr)_116px_104px] md:items-center md:gap-4">
      <div className="grid gap-3 border-x border-b border-[#D8E4F2] bg-white px-3 py-3 transition hover:bg-[#F7FAFF] sm:px-4 md:grid-cols-[120px_minmax(180px,1.1fr)_58px_minmax(180px,1.1fr)] md:items-center">
        <div className="tabular-nums">
          <p className="text-sm font-black text-[#061A3A]">{formatShortDate(match.scheduledAt)}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">{formatTime(match.scheduledAt)}</p>
        </div>
        <TeamLogo compact logoUrl={match.homeTeam.logoUrl} name={match.homeTeam.name} />
        <ResultBadge match={match} />
        <TeamLogo compact logoUrl={match.awayTeam.logoUrl} name={match.awayTeam.name} />
      </div>
      <span className={`inline-flex w-fit items-center justify-center rounded-lg px-3 py-1.5 text-xs font-black ${statusClassNames[match.status]}`}>
        {statusLabels[match.status]}
      </span>
      <Link
        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#EF233C] px-3 text-xs font-black !text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
        href={`/zapasy/${match.id}`}
      >
        Zápis utkání
      </Link>
    </article>
  );
}

function TeamProgramTeam({
  highlight,
  team,
}: {
  highlight: boolean;
  team: MatchTeam;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 ${highlight ? "bg-[#F4F8FF]" : ""}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D8E4F2] bg-white p-1 shadow-sm">
        {team.logoUrl ? (
          <Image
            alt={`Logo ${team.name}`}
            className="h-full w-full object-contain"
            height={32}
            src={team.logoUrl}
            unoptimized
            width={32}
          />
        ) : (
          <span className="text-xs font-black text-[#0B2F6B]">{team.name.charAt(0)}</span>
        )}
      </div>
      <span className={`min-w-0 truncate text-sm leading-tight text-[#061A3A] ${highlight ? "font-black" : "font-bold"}`}>
        {team.name}
      </span>
    </div>
  );
}

function TeamProgramMatchRow({
  match,
  selectedTeamSeasonId,
}: {
  match: PublicMatch;
  selectedTeamSeasonId: string;
}) {
  const isHomeSelected = match.homeTeam.teamSeasonId === selectedTeamSeasonId;
  const isAwaySelected = match.awayTeam.teamSeasonId === selectedTeamSeasonId;

  return (
    <article className="grid gap-3 border-x border-b border-[#D8E4F2] bg-white px-3 py-3 transition hover:bg-[#F7FAFF] md:grid-cols-[58px_136px_minmax(160px,1fr)_68px_minmax(160px,1fr)_124px_112px] md:items-center md:gap-3">
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 md:hidden">Kolo</span>
        <span className="text-sm font-black tabular-nums text-[#061A3A]">
          {match.roundNumber === null ? "-" : `${match.roundNumber}.`}
        </span>
      </div>
      <div className="tabular-nums">
        <p className="text-sm font-black text-[#061A3A]">{formatShortDate(match.scheduledAt)}</p>
        <p className="mt-0.5 text-xs font-bold text-slate-500">{formatTime(match.scheduledAt)}</p>
      </div>
      <TeamProgramTeam highlight={isHomeSelected} team={match.homeTeam} />
      <div className="flex justify-center">
        <ResultBadge match={match} />
      </div>
      <TeamProgramTeam highlight={isAwaySelected} team={match.awayTeam} />
      <span className={`inline-flex w-fit items-center justify-center rounded-lg px-3 py-1.5 text-xs font-black ${statusClassNames[match.status]}`}>
        {statusLabels[match.status]}
      </span>
      <Link
        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#EF233C] px-3 text-xs font-black !text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
        href={`/zapasy/${match.id}`}
      >
        Zápis utkání
      </Link>
    </article>
  );
}

function TeamProgramByeRow({ bye }: { bye: PublicMatchBye }) {
  return (
    <article className="grid gap-3 border-x border-b border-[#D8E4F2] bg-slate-50 px-3 py-3 transition hover:bg-slate-100 md:grid-cols-[58px_136px_minmax(160px,1fr)_68px_minmax(160px,1fr)_124px_112px] md:items-center md:gap-3">
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 md:hidden">Kolo</span>
        <span className="text-sm font-black tabular-nums text-[#061A3A]">{bye.roundNumber}.</span>
      </div>
      <span className="text-sm font-black text-slate-500">-</span>
      <TeamProgramTeam highlight team={bye.team} />
      <div className="flex justify-center">
        <div className="inline-flex h-9 min-w-14 items-center justify-center rounded-lg border border-dashed border-[#D8E4F2] bg-white px-3 text-center text-sm font-black text-slate-500">
          Volno
        </div>
      </div>
      <span className="min-w-0 text-sm font-black text-slate-500">-</span>
      <span className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">
        Bez zápasu
      </span>
      <span className="inline-flex h-9 items-center justify-center rounded-lg border border-[#B9C9DF] bg-white px-3 text-xs font-black text-[#0B2F6B]">
        -
      </span>
    </article>
  );
}

function ByeRow({ bye }: { bye: PublicMatchBye }) {
  return (
    <article className="grid gap-3 md:grid-cols-[minmax(0,1fr)_116px_104px] md:items-center md:gap-4">
      <div className="grid gap-3 border-x border-b border-[#D8E4F2] bg-slate-50 px-3 py-3 transition hover:bg-slate-100 sm:px-4 md:grid-cols-[120px_minmax(180px,1.1fr)_58px_minmax(180px,1.1fr)] md:items-center">
        <p className="text-sm font-black text-slate-500">Volno</p>
        <TeamLogo compact logoUrl={bye.team.logoUrl} name={bye.team.name} />
        <div className="inline-flex h-9 w-14 items-center justify-center rounded-lg border border-dashed border-[#D8E4F2] bg-white text-center text-sm font-black text-slate-500">
          -
        </div>
        <p className="min-w-0 text-sm font-black text-slate-500">Tým v tomto kole nehraje</p>
      </div>
      <span className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">
        Bez zápasu
      </span>
      <span className="inline-flex h-9 items-center justify-center rounded-lg border border-[#B9C9DF] bg-white px-3 text-xs font-black text-[#0B2F6B]">
        Volno
      </span>
    </article>
  );
}

export default function PublicMatchesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [teams, setTeams] = useState<MatchTeam[]>([]);
  const [matches, setMatches] = useState<PublicMatch[]>([]);
  const [byes, setByes] = useState<PublicMatchBye[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFiltersFromUrl);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewModeFromUrl);
  const [sideFilter, setSideFilter] = useState<MatchSideFilter>(initialSideFilterFromUrl);
  const [isUrlReady, setIsUrlReady] = useState(false);
  const [hasGroupsForSelectedLeague, setHasGroupsForSelectedLeague] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredLeagues = useMemo(
    () => leagues.filter((league) => league.season_id === filters.seasonId),
    [filters.seasonId, leagues],
  );
  const filteredGroups = useMemo(
    () => groups.filter((group) => group.league_id === filters.leagueId),
    [filters.leagueId, groups],
  );
  const selectedSeason = seasons.find((season) => season.id === filters.seasonId);
  const selectedLeague = leagues.find((league) => league.id === filters.leagueId);
  const selectedGroup = groups.find((group) => group.id === filters.groupId);
  const selectedTeam = teams.find((team) => team.teamSeasonId === filters.teamSeasonId);
  const selectedTeamSeasonId = selectedTeam?.teamSeasonId ?? "";
  const isTeamViewAvailable = Boolean(selectedTeamSeasonId);
  const roundSections = useMemo(() => groupMatchesByRound(matches, byes), [byes, matches]);
  const teamProgram = useMemo(
    () => buildTeamProgram(matches, isTeamViewAvailable ? byes : []),
    [byes, isTeamViewAvailable, matches],
  );
  const filteredTeamProgram = filterTeamProgramBySide(teamProgram, selectedTeamSeasonId, sideFilter);
  const effectiveView: ViewMode = isTeamViewAvailable ? viewMode : "rounds";
  const effectiveSideFilter: MatchSideFilter = isTeamViewAvailable ? sideFilter : "all";

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setFilters({
        seasonId: params.get("season_id") ?? "",
        leagueId: params.get("league_id") ?? "",
        groupId: params.get("group_id") ?? "",
        teamSeasonId: params.get("team_season_id") ?? "",
      });
      setViewMode(viewModeFromParams(params));
      setSideFilter(params.get("team_season_id") ? sideFilterFromParams(params) : "all");
      setIsUrlReady(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isUrlReady) return;

    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetchMatches(filters)
        .then((body) => {
          if (!isMounted) return;
          const nextFilters = {
            seasonId: body.selected?.seasonId ?? "",
            leagueId: body.selected?.leagueId ?? "",
            groupId: body.selected?.groupId ?? "",
            teamSeasonId: body.selected?.teamSeasonId ?? "",
          };

          setSeasons(body.seasons ?? []);
          setLeagues(body.leagues ?? []);
          setGroups(body.groups ?? []);
          setTeams(body.teams ?? []);
          setMatches(body.matches ?? []);
          setByes(body.byes ?? []);
          setHasGroupsForSelectedLeague(body.hasGroupsForSelectedLeague ?? true);
          setFilters((current) =>
            current.seasonId === nextFilters.seasonId &&
            current.leagueId === nextFilters.leagueId &&
            current.groupId === nextFilters.groupId &&
            current.teamSeasonId === nextFilters.teamSeasonId
              ? current
              : nextFilters,
          );
          setViewMode((currentViewMode) => {
            const nextViewMode = nextFilters.teamSeasonId ? currentViewMode : "rounds";
            setSideFilter((currentSideFilter) => {
              const nextSideFilter = nextFilters.teamSeasonId ? currentSideFilter : "all";
              updateUrl(nextFilters, nextViewMode, nextSideFilter);
              return nextSideFilter;
            });
            return nextViewMode;
          });
          setIsLoading(false);
        })
        .catch((loadError) => {
          if (!isMounted) return;
          setError(loadError instanceof Error ? loadError.message : "Zápasy se nepodařilo načíst.");
          setIsLoading(false);
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [filters, isUrlReady]);

  function changeFilters(nextFilters: Filters, nextViewMode: ViewMode) {
    const nextSideFilter = nextFilters.teamSeasonId ? sideFilter : "all";
    setFilters(nextFilters);
    setViewMode(nextViewMode);
    setSideFilter(nextSideFilter);
    updateUrl(nextFilters, nextViewMode, nextSideFilter);
  }

  function changeViewMode(nextViewMode: ViewMode) {
    if (nextViewMode === "team" && !isTeamViewAvailable) return;
    setViewMode(nextViewMode);
    updateUrl(filters, nextViewMode, effectiveSideFilter);
  }

  function changeSideFilter(nextSideFilter: MatchSideFilter) {
    if (!isTeamViewAvailable) return;
    setSideFilter(nextSideFilter);
    updateUrl(filters, effectiveView, nextSideFilter);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader activeHref="/zapasy" />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_90%_40%,rgba(239,35,60,0.24),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_52%,#061A3A_100%)]" />
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-8 -z-10 h-auto w-[520px] max-w-[72vw] opacity-[0.08]"
          height={900}
          src="/brand/zss-logo-official.png"
          width={700}
        />
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
            Týmová liga
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Zápasy týmové ligy</h1>
          <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">
            Program a výsledky utkání podle sezón, lig, skupin a jednotlivých kol.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-black text-blue-100">
            {selectedSeason ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedSeason.name}</span> : null}
            {selectedLeague ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedLeague.name}</span> : null}
            {selectedGroup ? <span className="rounded-full bg-[#EF233C] px-4 py-2 text-white">{selectedGroup.name}</span> : null}
            {selectedTeam ? <span className="rounded-full bg-white px-4 py-2 text-[#061A3A]">{selectedTeam.name}</span> : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Sezóna
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) => {
                  const seasonId = event.target.value;
                  const nextLeague = leagues.find((league) => league.season_id === seasonId);
                  const nextGroup = groups.find((group) => group.league_id === nextLeague?.id);
                  changeFilters({
                    seasonId,
                    leagueId: nextLeague?.id ?? "",
                    groupId: nextGroup?.id ?? "",
                    teamSeasonId: "",
                  }, "rounds");
                }}
                value={filters.seasonId}
              >
                <option value="">Vyberte sezónu</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                    {season.is_active ? " - aktivní" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Liga
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) => {
                  const leagueId = event.target.value;
                  const nextGroup = groups.find((group) => group.league_id === leagueId);
                  changeFilters({
                    ...filters,
                    leagueId,
                    groupId: nextGroup?.id ?? "",
                    teamSeasonId: "",
                  }, "rounds");
                }}
                value={filters.leagueId}
              >
                <option value="">Vyberte ligu</option>
                {filteredLeagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Skupina
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={!hasGroupsForSelectedLeague}
                onChange={(event) =>
                  changeFilters({ ...filters, groupId: event.target.value, teamSeasonId: "" }, "rounds")
                }
                value={filters.groupId}
              >
                <option value="">{hasGroupsForSelectedLeague ? "Vyberte skupinu" : "Liga nemá skupiny"}</option>
                {filteredGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Tým
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={teams.length === 0}
                onChange={(event) => {
                  const teamSeasonId = event.target.value;
                  changeFilters({ ...filters, teamSeasonId }, teamSeasonId ? "team" : "rounds");
                }}
                value={filters.teamSeasonId}
              >
                <option value="">{teams.length > 0 ? "Všechny týmy" : "Žádné týmy"}</option>
                {teams.map((team) => (
                  <option key={team.teamSeasonId} value={team.teamSeasonId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Rozložení
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8] disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={!isTeamViewAvailable}
                onChange={(event) => changeSideFilter(event.target.value as MatchSideFilter)}
                value={effectiveSideFilter}
              >
                <option value="all">Všechny</option>
                <option value="home">Domácí</option>
                <option value="away">Hosté</option>
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#D8E4F2] pt-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Zobrazení</p>
            <div className="inline-flex rounded-xl border border-[#D8E4F2] bg-[#F4F8FF] p-1">
              {([
                ["rounds", "Podle kol"],
                ["team", "Program týmu"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`rounded-lg px-4 py-2 text-xs font-black transition ${
                    effectiveView === mode
                      ? "bg-[#061A3A] text-white shadow-sm"
                      : mode === "team" && !isTeamViewAvailable
                        ? "cursor-not-allowed bg-white/50 text-slate-400"
                      : "text-[#0B2F6B] hover:bg-white"
                  }`}
                  disabled={mode === "team" && !isTeamViewAvailable}
                  onClick={() => changeViewMode(mode)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Načítám zápasy...
          </div>
        ) : !error && (effectiveView === "team" ? filteredTeamProgram.length : roundSections.length) === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-10 text-center shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Ligový program</p>
            <h2 className="mt-2 text-2xl font-black text-[#061A3A]">Zatím žádné zápasy</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-slate-500">
              Pro vybranou kombinaci filtrů zatím nejsou naplánované žádné zápasy.
            </p>
          </div>
        ) : effectiveView === "team" ? (
          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[#D8E4F2] pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Program týmu</p>
                <div className="mt-2 flex min-w-0 items-center gap-3">
                  {selectedTeam ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-white p-1.5 shadow-sm">
                      {selectedTeam.logoUrl ? (
                        <Image
                          alt={`Logo ${selectedTeam.name}`}
                          className="h-full w-full object-contain"
                          height={48}
                          src={selectedTeam.logoUrl}
                          unoptimized
                          width={48}
                        />
                      ) : (
                        <span className="text-base font-black text-[#0B2F6B]">{selectedTeam.name.charAt(0)}</span>
                      )}
                    </div>
                  ) : null}
                  <h2 className="min-w-0 text-3xl font-black tracking-tight text-[#061A3A]">
                    {selectedTeam?.name ?? "Všechny týmy"}
                    {selectedGroup ? ` - ${selectedGroup.name}` : ""}
                  </h2>
                </div>
              </div>
            </div>
            <div className="grid gap-0 rounded-[24px]">
              <div className="hidden rounded-t-[24px] border border-[#D8E4F2] bg-[#EEF5FF] px-3 py-3 text-xs font-black text-slate-600 md:grid md:grid-cols-[58px_136px_minmax(160px,1fr)_68px_minmax(160px,1fr)_124px_112px] md:items-center md:gap-3">
                <span>Kolo</span>
                <span>Datum a čas</span>
                <span>Domácí</span>
                <span className="text-center">Výsledek</span>
                <span>Hosté</span>
                <span>Stav</span>
                <span className="text-center">Detail</span>
              </div>
              {filteredTeamProgram.map((item) =>
                item.type === "match" ? (
                  <TeamProgramMatchRow
                    key={item.id}
                    match={item.match}
                    selectedTeamSeasonId={selectedTeamSeasonId}
                  />
                ) : (
                  <TeamProgramByeRow key={item.id} bye={item.bye} />
                ),
              )}
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-10">
            {roundSections.map((section) => (
              <section key={section.label}>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[#D8E4F2] pb-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Ligový program</p>
                    <h2 className="mt-1 text-3xl font-black tracking-tight text-[#061A3A]">
                      {section.label}{selectedGroup ? ` - ${selectedGroup.name}` : ""}
                    </h2>
                  </div>
                  {section.dateRange ? (
                    <p className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#0B2F6B] shadow-sm">
                      {section.dateRange}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-0 rounded-[24px]">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_116px_104px] md:items-center md:gap-4">
                    <div className="grid rounded-t-[24px] border border-[#D8E4F2] bg-[#EEF5FF] px-4 py-3 text-xs font-black text-slate-600 md:grid-cols-[120px_minmax(180px,1.1fr)_58px_minmax(180px,1.1fr)]">
                      <span>Datum a čas</span>
                      <span>Domácí</span>
                      <span className="text-center">VS</span>
                      <span>Hosté</span>
                    </div>
                    <span>Stav</span>
                    <span className="text-center">Detail</span>
                  </div>
                  {section.matches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))}
                  {section.byes.map((bye) => (
                    <ByeRow key={`bye:${section.roundNumber}:${bye.team.teamSeasonId}`} bye={bye} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <PublicFooter />
    </main>
  );
}
