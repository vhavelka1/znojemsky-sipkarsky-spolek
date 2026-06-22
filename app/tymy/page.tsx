"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
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
};

type TeamCard = {
  id: string;
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
  seasonName: string;
  captain: string | null;
  playerCount: number;
  homeVenue: string | null;
};

type TeamsPayload = {
  seasons?: Season[];
  leagues?: League[];
  groups?: LeagueGroup[];
  teams?: TeamCard[];
  selected?: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    search: string;
  };
  error?: string;
};

type Filters = {
  seasonId: string;
  leagueId: string;
  groupId: string;
  search: string;
};

const emptyFilters: Filters = {
  seasonId: "",
  leagueId: "",
  groupId: "",
  search: "",
};

async function fetchTeams(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.seasonId) params.set("season_id", filters.seasonId);
  if (filters.leagueId) params.set("league_id", filters.leagueId);
  if (filters.groupId) params.set("group_id", filters.groupId);
  if (filters.search.trim()) params.set("search", filters.search.trim());

  const response = await fetch(`/api/public/teams?${params.toString()}`, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as TeamsPayload;
  if (!response.ok) throw new Error(body.error ?? "Týmy se nepodařilo načíst.");
  return body;
}

function TeamLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[#D8E4F2] bg-white p-2 shadow-sm">
      {logoUrl ? (
        <Image alt={`Logo ${name}`} className="h-full w-full object-contain" height={80} src={logoUrl} unoptimized width={80} />
      ) : (
        <span className="text-2xl font-black text-[#0B2F6B]">{name.charAt(0)}</span>
      )}
    </div>
  );
}

export default function PublicTeamsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [teams, setTeams] = useState<TeamCard[]>([]);
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
      fetchTeams(filters)
        .then((body) => {
          if (!isMounted) return;
          setSeasons(body.seasons ?? []);
          setLeagues(body.leagues ?? []);
          setGroups(body.groups ?? []);
          setTeams(body.teams ?? []);
          setFilters((current) => {
            const nextFilters = {
              seasonId: body.selected?.seasonId ?? "",
              leagueId: body.selected?.leagueId ?? "",
              groupId: body.selected?.groupId ?? "",
              search: current.search,
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
          setError(loadError instanceof Error ? loadError.message : "Týmy se nepodařilo načíst.");
          setIsLoading(false);
        });
    }, 200);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [filters]);

  return (
    <PublicPageShell activeHref="/tymy">
      <PublicHero
        description="Přehled týmů Znojemského šipkařského spolku."
        eyebrow="Týmová liga"
        title="Týmy"
      >
        <div className="flex flex-wrap gap-3 text-sm font-black text-blue-100">
          {selectedSeason ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedSeason.name}</span> : null}
          {selectedLeague ? <span className="rounded-full bg-white/10 px-4 py-2">{selectedLeague.name}</span> : null}
          {selectedGroup ? <span className="rounded-full bg-[#EF233C] px-4 py-2 text-white">{selectedGroup.name}</span> : null}
        </div>
      </PublicHero>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Sezóna
              <select
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]"
                onChange={(event) => {
                  const seasonId = event.target.value;
                  const nextLeague = leagues.find((league) => league.season_id === seasonId);
                  const nextGroup = groups.find((group) => group.league_id === nextLeague?.id);
                  setFilters((current) => ({
                    ...current,
                    seasonId,
                    leagueId: nextLeague?.id ?? "",
                    groupId: nextGroup?.id ?? "",
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
                  const nextGroup = groups.find((group) => group.league_id === leagueId);
                  setFilters((current) => ({ ...current, leagueId, groupId: nextGroup?.id ?? "" }));
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
                onChange={(event) => setFilters((current) => ({ ...current, groupId: event.target.value }))}
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

            <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
              Hledat tým
              <input
                className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-[#0F4FA8]"
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Název týmu"
                type="search"
                value={filters.search}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div> : null}
        {isLoading ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Načítám týmy...
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Zatím nejsou zadané žádné týmy.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <article
                className="rounded-[30px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(6,26,58,0.12)]"
                key={team.teamSeasonId}
              >
                <div className="flex items-start gap-4">
                  <TeamLogo logoUrl={team.logoUrl} name={team.name} />
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">{team.seasonName}</p>
                    <h2 className="mt-1 text-2xl font-black leading-tight text-[#061A3A]">{team.name}</h2>
                    {team.homeVenue ? <p className="mt-2 text-sm font-bold text-slate-500">{team.homeVenue}</p> : null}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Kapitán</p>
                    <p className="mt-1 font-black text-[#061A3A]">{team.captain ?? "Nezadáno"}</p>
                  </div>
                  <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Hráči</p>
                    <p className="mt-1 font-black text-[#061A3A]">{team.playerCount}</p>
                  </div>
                </div>

                <Link
                  className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500"
                  href={`/tymy/${team.id}`}
                >
                  Detail týmu
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
