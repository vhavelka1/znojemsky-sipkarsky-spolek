"use client";

import Image from "next/image";
import Link from "next/link";
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

type StandingRow = {
  teamSeasonId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  overtimeWins: number;
  overtimeLosses: number;
  losses: number;
  matchScoreFor: number;
  matchScoreAgainst: number;
  matchScoreDiff: number;
  legScoreFor: number;
  legScoreAgainst: number;
  legScoreDiff: number;
  points: number;
};

type TablePayload = {
  seasons?: Season[];
  leagues?: League[];
  groups?: LeagueGroup[];
  selected?: {
    seasonId: string;
    leagueId: string;
    groupId: string;
  };
  standings?: StandingRow[];
  error?: string;
};

type Filters = {
  seasonId: string;
  leagueId: string;
  groupId: string;
};

const navigationItems = [
  { href: "/", label: "Úvod" },
  { href: "/tabulky", label: "Liga" },
  { href: "/turnaje", label: "Turnaje" },
  { href: "/kalendar", label: "Kalendář" },
  { href: "/hraci", label: "Hráči" },
  { href: "/tymy", label: "Týmy" },
  { href: "/galerie", label: "Galerie" },
  { href: "/scoreboard", label: "ScoreBoard" },
  { href: "/diskuze", label: "Diskuze" },
  { href: "/kontakt", label: "Kontakt" },
];

const emptyFilters: Filters = {
  seasonId: "",
  leagueId: "",
  groupId: "",
};

function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#061A3A]/95 text-white shadow-[0_14px_40px_rgba(6,26,58,0.22)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link aria-label="Znojemský šipkařský spolek" className="flex items-center gap-3" href="/">
          <Image
            alt="Logo Znojemského šipkařského spolku"
            className="h-14 w-14 rounded-2xl object-contain shadow-lg shadow-black/25 sm:h-16 sm:w-16"
            height={256}
            priority
            src="/brand/zss-logo-official.png"
            width={256}
          />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-black uppercase tracking-[0.14em]">Znojemský</p>
            <p className="text-lg font-black uppercase tracking-[0.08em] text-[#3B82F6]">Šipkařský spolek</p>
          </div>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <nav className="hidden items-center gap-5 xl:flex">
            {navigationItems.map((item) => (
              <Link
                className={`text-sm font-extrabold transition ${
                  item.href === "/tabulky" ? "text-white" : "text-blue-100 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link className="shrink-0 rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500" href="/admin">
            Administrace
          </Link>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-3 sm:px-6 xl:hidden">
        {navigationItems.map((item) => (
          <Link
            className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-bold ${
              item.href === "/tabulky"
                ? "border-white bg-white text-[#061A3A]"
                : "border-white/10 bg-white/5 text-blue-100"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function TeamLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-white p-1 shadow-sm">
      {logoUrl ? (
        <Image
          alt={`Logo ${name}`}
          className="h-full w-full object-contain"
          height={48}
          src={logoUrl}
          unoptimized
          width={48}
        />
      ) : (
        <span className="text-sm font-black text-[#0B2F6B]">{name.charAt(0)}</span>
      )}
    </div>
  );
}

function formatDiff(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

async function fetchTables(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.seasonId) params.set("season_id", filters.seasonId);
  if (filters.leagueId) params.set("league_id", filters.leagueId);
  if (filters.groupId) params.set("group_id", filters.groupId);

  const response = await fetch(`/api/public/tables?${params.toString()}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as TablePayload;
  if (!response.ok) throw new Error(body.error ?? "Tabulky se nepodařilo načíst.");
  return body;
}

export default function PublicTablesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
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

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetchTables({
        seasonId: filters.seasonId,
        leagueId: filters.leagueId,
        groupId: filters.groupId,
      })
        .then((body) => {
          if (!isMounted) return;
          setSeasons(body.seasons ?? []);
          setLeagues(body.leagues ?? []);
          setGroups(body.groups ?? []);
          setStandings(body.standings ?? []);
          setFilters((current) => {
            const nextFilters = {
              seasonId: body.selected?.seasonId ?? "",
              leagueId: body.selected?.leagueId ?? "",
              groupId: body.selected?.groupId ?? "",
            };
            return current.seasonId === nextFilters.seasonId &&
              current.leagueId === nextFilters.leagueId &&
              current.groupId === nextFilters.groupId
              ? current
              : nextFilters;
          });
          setIsLoading(false);
        })
        .catch((loadError) => {
          if (!isMounted) return;
          setError(loadError instanceof Error ? loadError.message : "Tabulky se nepodařilo načíst.");
          setIsLoading(false);
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [filters.groupId, filters.leagueId, filters.seasonId]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader />

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
          <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Tabulky týmové ligy</h1>
          <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">
            Aktuální pořadí týmů podle sezón, lig a skupin.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-black text-blue-100">
            {selectedSeason ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedSeason.name}</span> : null}
            {selectedLeague ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedLeague.name}</span> : null}
            {selectedGroup ? <span className="rounded-full bg-[#EF233C] px-4 py-2 text-white">{selectedGroup.name}</span> : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Sezóna
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) => {
                  const seasonId = event.target.value;
                  const nextLeague = leagues.find((league) => league.season_id === seasonId);
                  const nextGroup = groups.find((group) => group.league_id === nextLeague?.id);
                  setFilters({
                    seasonId,
                    leagueId: nextLeague?.id ?? "",
                    groupId: nextGroup?.id ?? "",
                  });
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
                  setFilters((current) => ({
                    ...current,
                    leagueId,
                    groupId: nextGroup?.id ?? "",
                  }));
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
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, groupId: event.target.value }))
                }
                value={filters.groupId}
              >
                <option value="">Vyberte skupinu</option>
                {filteredGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[32px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">
                {selectedGroup?.name ?? "Skupina"}
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">
                Ligová tabulka
              </h2>
            </div>
            <p className="text-sm font-bold text-slate-500">
              Body: výhra 3, remíza 1, prohra 0
            </p>
          </div>

          {error ? (
            <div className="px-6 py-5 text-sm font-bold text-red-700">{error}</div>
          ) : null}

          {isLoading ? (
            <div className="px-6 py-8 text-sm font-bold text-slate-500">Načítám tabulku...</div>
          ) : standings.length === 0 ? (
            <div className="px-6 py-8 text-sm font-bold text-slate-500">Tabulka zatím není dostupná.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-[#F4F8FF] text-xs font-black uppercase tracking-[0.08em] text-[#64748b]">
                  <tr>
                    <th className="px-4 py-4">Pořadí</th>
                    <th className="px-4 py-4">Logo týmu</th>
                    <th className="px-4 py-4">Tým</th>
                    <th className="px-3 py-4 text-right">Z</th>
                    <th className="px-3 py-4 text-right">V</th>
                    <th className="px-3 py-4 text-right">Vp</th>
                    <th className="px-3 py-4 text-right">Pp</th>
                    <th className="px-3 py-4 text-right">P</th>
                    <th className="px-4 py-4 text-right">Skóre zápasy</th>
                    <th className="px-4 py-4 text-right">Rozdíl zápasy</th>
                    <th className="px-4 py-4 text-right">Skóre legy</th>
                    <th className="px-4 py-4 text-right">Rozdíl legy</th>
                    <th className="px-4 py-4 text-right">Body</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E4F2]">
                  {standings.map((row, index) => (
                    <tr
                      className={`transition hover:bg-[#F4F8FF] ${
                        index < 3 ? "bg-[#F4F8FF]/55" : "bg-white"
                      }`}
                      key={row.teamSeasonId}
                    >
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl px-3 text-lg font-black ${
                            index === 0
                              ? "bg-[#EF233C] text-white"
                              : index < 3
                                ? "bg-[#0F4FA8] text-white"
                                : "bg-[#F4F8FF] text-[#061A3A]"
                          }`}
                        >
                          {index + 1}.
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <TeamLogo logoUrl={row.logoUrl} name={row.teamName} />
                      </td>
                      <td className="px-4 py-4 text-base font-black text-[#061A3A]">
                        {row.teamName}
                      </td>
                      <td className="px-3 py-4 text-right font-bold">{row.played}</td>
                      <td className="px-3 py-4 text-right font-bold">{row.wins}</td>
                      <td className="px-3 py-4 text-right font-bold">{row.overtimeWins}</td>
                      <td className="px-3 py-4 text-right font-bold">{row.overtimeLosses}</td>
                      <td className="px-3 py-4 text-right font-bold">{row.losses}</td>
                      <td className="px-4 py-4 text-right font-bold">
                        {row.matchScoreFor} : {row.matchScoreAgainst}
                      </td>
                      <td className="px-4 py-4 text-right font-bold">
                        {formatDiff(row.matchScoreDiff)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold">
                        {row.legScoreFor} : {row.legScoreAgainst}
                      </td>
                      <td className="px-4 py-4 text-right font-bold">
                        {formatDiff(row.legScoreDiff)}
                      </td>
                      <td className="px-4 py-4 text-right text-xl font-black text-[#061A3A]">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <footer className="bg-[#061A3A] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <Image
              alt="Logo Znojemského šipkařského spolku"
              className="h-14 w-14 rounded-2xl object-contain"
              height={256}
              src="/brand/zss-logo-official.png"
              width={256}
            />
            <div>
              <p className="font-black">Znojemský šipkařský spolek</p>
              <p className="text-sm text-blue-200">Výsledky, tabulky a dění ze znojemských šipek.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-bold text-blue-100">
            <Link href="/">Úvod</Link>
            <Link href="/tabulky">Tabulky</Link>
            <Link href="/zapasy">Zápasy</Link>
            <Link href="/turnaje">Turnaje</Link>
            <Link href="/admin">Administrace</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
