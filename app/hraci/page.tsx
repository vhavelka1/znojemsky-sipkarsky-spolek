"use client";

import Image from "next/image";
import Link from "next/link";
import { PublicHeader as SharedPublicHeader } from "@/components/public/PublicShell";
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

type PublicTeam = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
};

type PlayerStat = {
  playerId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  teamSeasonId: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  playedMatches: number;
  wonMatches: number;
  lostMatches: number;
  winPercentage: number;
  wonLegs: number;
  lostLegs: number;
  score95Plus: number;
  score133Plus: number;
  score171Plus: number;
  checkout100Plus: number;
  usefulnessScore: number;
};

type PlayersPayload = {
  seasons?: Season[];
  leagues?: League[];
  groups?: LeagueGroup[];
  teams?: PublicTeam[];
  players?: Array<{ id: string }>;
  selected?: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    teamSeasonId: string;
    search: string;
  };
  playerStats?: PlayerStat[];
  error?: string;
};

type Filters = {
  seasonId: string;
  leagueId: string;
  groupId: string;
  teamSeasonId: string;
  search: string;
};


const emptyFilters: Filters = {
  seasonId: "",
  leagueId: "",
  groupId: "",
  teamSeasonId: "",
  search: "",
};

function PublicHeader() {
  return <SharedPublicHeader activeHref="/hraci" />;
}

function PublicFooter() {
  return (
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
          <Link href="/prihlaseni">Přihlášení</Link>
        </div>
      </div>
    </footer>
  );
}

function TeamLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-white p-1 shadow-sm">
      {logoUrl ? (
        <Image
          alt={`Logo ${name}`}
          className="h-full w-full object-contain"
          height={44}
          src={logoUrl}
          unoptimized
          width={44}
        />
      ) : (
        <span className="text-sm font-black text-[#0B2F6B]">{name.charAt(0)}</span>
      )}
    </div>
  );
}

function formatPercentage(value: number) {
  return `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
}

function formatDecimal(value: number) {
  return value.toLocaleString("cs-CZ", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

async function fetchPlayers(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.seasonId) params.set("season_id", filters.seasonId);
  if (filters.leagueId) params.set("league_id", filters.leagueId);
  if (filters.groupId) params.set("group_id", filters.groupId);
  if (filters.teamSeasonId) params.set("team_season_id", filters.teamSeasonId);
  if (filters.search.trim()) params.set("search", filters.search.trim());

  const response = await fetch(`/api/public/players?${params.toString()}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as PlayersPayload;
  if (!response.ok) throw new Error(body.error ?? "Hráče se nepodařilo načíst.");
  return body;
}

export default function PublicPlayersPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
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
  const hasPlayedStats = playerStats.some((stat) => stat.playedMatches > 0);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetchPlayers(filters)
        .then((body) => {
          if (!isMounted) return;
          setSeasons(body.seasons ?? []);
          setLeagues(body.leagues ?? []);
          setGroups(body.groups ?? []);
          setTeams(body.teams ?? []);
          setPlayersCount(body.players?.length ?? 0);
          setPlayerStats(body.playerStats ?? []);
          setFilters((current) => {
            const nextFilters = {
              seasonId: body.selected?.seasonId ?? "",
              leagueId: body.selected?.leagueId ?? "",
              groupId: body.selected?.groupId ?? "",
              teamSeasonId: body.selected?.teamSeasonId ?? "",
              search: current.search,
            };
            return current.seasonId === nextFilters.seasonId &&
              current.leagueId === nextFilters.leagueId &&
              current.groupId === nextFilters.groupId &&
              current.teamSeasonId === nextFilters.teamSeasonId
              ? current
              : nextFilters;
          });
          setIsLoading(false);
        })
        .catch((loadError) => {
          if (!isMounted) return;
          setError(loadError instanceof Error ? loadError.message : "Hráče se nepodařilo načíst.");
          setIsLoading(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [filters]);

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
            Individuální statistiky
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Hráči</h1>
          <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">
            Profily hráčů, soupisky týmů a individuální statistiky sezóny.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-black text-blue-100">
            {selectedSeason ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedSeason.name}</span> : null}
            {selectedLeague ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedLeague.name}</span> : null}
            {!selectedLeague ? <span className="rounded-full bg-white/10 px-4 py-2">Celá sezóna</span> : null}
            {selectedGroup ? <span className="rounded-full bg-[#EF233C] px-4 py-2 text-white">{selectedGroup.name}</span> : null}
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
                  setFilters((current) => ({
                    ...current,
                    seasonId,
                    leagueId: "",
                    groupId: "",
                    teamSeasonId: "",
                  }));
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
                  const nextGroup = leagueId ? groups.find((group) => group.league_id === leagueId) : null;
                  setFilters((current) => ({
                    ...current,
                    leagueId,
                    groupId: nextGroup?.id ?? "",
                    teamSeasonId: "",
                  }));
                }}
                value={filters.leagueId}
              >
                <option value="">Všechny ligy</option>
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
                  setFilters((current) => ({ ...current, groupId: event.target.value, teamSeasonId: "" }))
                }
                disabled={!filters.leagueId}
                value={filters.groupId}
              >
                <option value="">{filters.leagueId ? "Všechny skupiny" : "Nejdřív vyberte ligu"}</option>
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
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, teamSeasonId: event.target.value }))
                }
                value={filters.teamSeasonId}
              >
                <option value="">Všechny týmy</option>
                {teams.map((team) => (
                  <option key={team.teamSeasonId} value={team.teamSeasonId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Hledat hráče
              <input
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-[#0F4FA8]"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Jméno hráče"
                type="search"
                value={filters.search}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[32px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">
                {selectedGroup?.name ?? selectedLeague?.name ?? "Celá sezóna"}
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">
                Nejlepší hráči sezóny
              </h2>
            </div>
            <p className="text-sm font-bold text-slate-500">
              Statistika dvouher, výkony ze zápisů utkání
            </p>
          </div>

          {error ? (
            <div className="px-6 py-5 text-sm font-bold text-red-700">{error}</div>
          ) : null}

          {isLoading ? (
            <div className="px-6 py-8 text-sm font-bold text-slate-500">Načítám hráče...</div>
          ) : playersCount === 0 ? (
            <div className="px-6 py-8 text-sm font-bold text-slate-500">Zatím nejsou zadaní žádní hráči.</div>
          ) : playerStats.length === 0 ? (
            <div className="px-6 py-8 text-sm font-bold text-slate-500">Zatím nejsou zadaní žádní hráči.</div>
          ) : (
            <>
              {!hasPlayedStats ? (
                <div className="border-b border-[#D8E4F2] bg-[#F4F8FF] px-6 py-4 text-sm font-bold text-slate-600">
                  Statistiky budou dostupné po odehrání prvních zápasů.
                </div>
              ) : null}

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1220px] text-left text-sm">
                  <thead className="bg-[#F4F8FF] text-xs font-black uppercase tracking-[0.08em] text-[#64748b]">
                    <tr>
                      <th className="px-4 py-4">Pořadí</th>
                      <th className="px-4 py-4">Hráč</th>
                      <th className="px-4 py-4">Tým</th>
                      <th className="px-3 py-4 text-right">OZ</th>
                      <th className="px-3 py-4 text-right">VZ</th>
                      <th className="px-3 py-4 text-right">PZ</th>
                      <th className="px-4 py-4 text-right">Úspěšnost</th>
                      <th className="px-4 py-4 text-right">
                        <span title="Kombinované skóre hráče podle úspěšnosti, legů, aktivity a výkonů.">
                          Užitečnost
                        </span>
                      </th>
                      <th className="px-4 py-4 text-right">Legy</th>
                      <th className="px-3 py-4 text-right">95+</th>
                      <th className="px-3 py-4 text-right">133+</th>
                      <th className="px-3 py-4 text-right">171+</th>
                      <th className="px-4 py-4 text-right">Zavření 100+</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8E4F2]">
                    {playerStats.map((player, index) => (
                      <tr className="transition hover:bg-[#F4F8FF]" key={player.playerId}>
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
                          <Link className="text-base font-black text-[#061A3A] hover:text-[#EF233C]" href={`/hraci/${player.playerId}`}>
                            {player.displayName}
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <TeamLogo logoUrl={player.teamLogoUrl} name={player.teamName} />
                            <span className="font-bold text-[#061A3A]">{player.teamName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right font-bold">{player.playedMatches}</td>
                        <td className="px-3 py-4 text-right font-bold">{player.wonMatches}</td>
                        <td className="px-3 py-4 text-right font-bold">{player.lostMatches}</td>
                        <td className="px-4 py-4 text-right font-bold">{formatPercentage(player.winPercentage)}</td>
                        <td className="px-4 py-4 text-right text-base font-black text-[#EF233C]">
                          {formatDecimal(player.usefulnessScore)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold">
                          {player.wonLegs} : {player.lostLegs}
                        </td>
                        <td className="px-3 py-4 text-right font-bold">{player.score95Plus}</td>
                        <td className="px-3 py-4 text-right font-bold">{player.score133Plus}</td>
                        <td className="px-3 py-4 text-right font-bold">{player.score171Plus}</td>
                        <td className="px-4 py-4 text-right font-bold">{player.checkout100Plus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 p-4 md:hidden">
                {playerStats.map((player, index) => (
                  <article className="rounded-[24px] border border-[#D8E4F2] bg-[#F4F8FF] p-4" key={player.playerId}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-[#EF233C]">{index + 1}. místo</p>
                        <Link className="mt-1 block text-xl font-black text-[#061A3A]" href={`/hraci/${player.playerId}`}>
                          {player.displayName}
                        </Link>
                      </div>
                      <TeamLogo logoUrl={player.teamLogoUrl} name={player.teamName} />
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-600">{player.teamName}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <StatBox label="OZ" value={player.playedMatches} />
                      <StatBox label="VZ" value={player.wonMatches} />
                      <StatBox label="PZ" value={player.lostMatches} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <StatBox label="Úspěšnost" value={formatPercentage(player.winPercentage)} />
                      <StatBox label="Užitečnost" value={formatDecimal(player.usefulnessScore)} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <StatBox label="Legy" value={`${player.wonLegs} : ${player.lostLegs}`} />
                      <StatBox label="Rozdíl legů" value={player.wonLegs - player.lostLegs} />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <StatBox label="95+" value={player.score95Plus} />
                      <StatBox label="133+" value={player.score133Plus} />
                      <StatBox label="171+" value={player.score171Plus} />
                      <StatBox label="Zavření" value={player.checkout100Plus} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        <section className="mt-6 rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-6">
          <h2 className="text-2xl font-black text-[#061A3A]">Jak se počítá užitečnost?</h2>
          <p className="mt-3 max-w-4xl text-sm font-bold leading-6 text-slate-600">
            Užitečnost kombinuje úspěšnost výher, rozdíl legů, aktivitu hráče a zapsané výkony. Díky tomu nezvýhodňuje pouze hráče s největším počtem zápasů ani hráče, kteří odehráli jen několik utkání.
          </p>
        </section>
      </section>

      <PublicFooter />
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-[#061A3A]">{value}</p>
    </div>
  );
}


