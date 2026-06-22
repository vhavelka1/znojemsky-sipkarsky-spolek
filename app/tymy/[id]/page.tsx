"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";

type TeamDetail = {
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
    publicDescription: string | null;
    homeVenue: string | null;
    publicContactEmail: string | null;
    websiteUrl: string | null;
    seasonName: string | null;
    captain: string | null;
  };
  roster: Array<{
    id: string;
    displayName: string;
    role: "player" | "captain" | "assistant_captain";
  }>;
  latestMatches: PublicMatch[];
  upcomingMatches: PublicMatch[];
  statistics: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
  };
  canManage: boolean;
  error?: string;
};

type PublicMatch = {
  id: string;
  date: string | null;
  statusLabel: string;
  isHome: boolean;
  result: {
    home_points: number;
    away_points: number;
  } | null;
};

function roleLabel(role: "player" | "captain" | "assistant_captain") {
  if (role === "captain") return "Kapitán";
  if (role === "assistant_captain") return "Zástupce";
  return "Hráč";
}

function roleClass(role: "player" | "captain" | "assistant_captain") {
  if (role === "captain") return "bg-[#EF233C] text-white";
  if (role === "assistant_captain") return "bg-[#0F4FA8] text-white";
  return "bg-[#F4F8FF] text-[#061A3A]";
}

function formatDate(value: string | null) {
  if (!value) return "Termín není zadaný";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function fetchTeam(id: string) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  const response = await fetch(`/api/public/teams/${id}`, { cache: "no-store", headers });
  const body = (await response.json().catch(() => ({}))) as TeamDetail;
  if (!response.ok) throw new Error(body.error ?? "Tým se nepodařilo načíst.");
  return body;
}

function MatchList({ emptyText, matches }: { emptyText: string; matches: PublicMatch[] }) {
  if (matches.length === 0) {
    return <p className="text-sm font-bold text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <Link
          className="flex items-center justify-between gap-3 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 transition hover:border-[#0F4FA8]"
          href={`/admin/matches/${match.id}`}
          key={match.id}
        >
          <div>
            <p className="text-sm font-black text-[#061A3A]">{formatDate(match.date)}</p>
            <p className="text-xs font-bold text-slate-500">{match.statusLabel}</p>
          </div>
          {match.result ? (
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[#061A3A]">
              {match.result.home_points}:{match.result.away_points}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export default function PublicTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<TeamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      fetchTeam(id)
        .then((body) => {
          if (!isMounted) return;
          setData(body);
          setIsLoading(false);
        })
        .catch((loadError) => {
          if (!isMounted) return;
          setError(loadError instanceof Error ? loadError.message : "Tým se nepodařilo načíst.");
          setIsLoading(false);
        });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [id]);

  return (
    <PublicPageShell activeHref="/tymy">
      <PublicHero
        description={data?.team.publicDescription || "Profil týmu, soupiska a aktuální zápasy."}
        eyebrow="Detail týmu"
        title={data?.team.name ?? "Tým"}
      >
        {data?.canManage ? (
          <Link
            className="inline-flex rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500"
            href="/muj-tym"
          >
            Spravovat tým
          </Link>
        ) : null}
      </PublicHero>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div> : null}
        {isLoading ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Načítám tým...
          </div>
        ) : data ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border border-[#D8E4F2] bg-[#F4F8FF] p-3">
                    {data.team.logoUrl ? (
                      <Image alt={`Logo ${data.team.name}`} className="h-full w-full object-contain" height={112} src={data.team.logoUrl} unoptimized width={112} />
                    ) : (
                      <span className="text-4xl font-black text-[#0B2F6B]">{data.team.name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">{data.team.seasonName ?? "Aktuální sezóna"}</p>
                    <h2 className="mt-2 text-3xl font-black text-[#061A3A]">{data.team.name}</h2>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold text-slate-600">
                      {data.team.homeVenue ? <span className="rounded-full bg-[#F4F8FF] px-3 py-1">{data.team.homeVenue}</span> : null}
                      {data.team.captain ? <span className="rounded-full bg-[#F4F8FF] px-3 py-1">Kapitán: {data.team.captain}</span> : null}
                      {data.team.publicContactEmail ? <a className="rounded-full bg-[#F4F8FF] px-3 py-1 text-[#0F4FA8]" href={`mailto:${data.team.publicContactEmail}`}>{data.team.publicContactEmail}</a> : null}
                      {data.team.websiteUrl ? <a className="rounded-full bg-[#F4F8FF] px-3 py-1 text-[#0F4FA8]" href={data.team.websiteUrl} rel="noreferrer" target="_blank">Web týmu</a> : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-2xl font-black text-[#061A3A]">Soupiska</h2>
                {data.roster.length === 0 ? (
                  <p className="mt-4 text-sm font-bold text-slate-500">Soupiska zatím není dostupná.</p>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {data.roster.map((player) => (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3" key={player.id}>
                        <span className="font-black text-[#061A3A]">{player.displayName}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${roleClass(player.role)}`}>{roleLabel(player.role)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Statistiky týmu</h2>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <StatBox label="Zápasy" value={data.statistics.played} />
                  <StatBox label="Výhry" value={data.statistics.wins} />
                  <StatBox label="Remízy" value={data.statistics.draws} />
                  <StatBox label="Prohry" value={data.statistics.losses} />
                </div>
              </section>

              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Poslední zápasy</h2>
                <div className="mt-5">
                  <MatchList emptyText="Zatím nejsou odehrané žádné zápasy." matches={data.latestMatches} />
                </div>
              </section>

              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Nadcházející zápasy</h2>
                <div className="mt-5">
                  <MatchList emptyText="Nejsou naplánované žádné zápasy." matches={data.upcomingMatches} />
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </section>
    </PublicPageShell>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#061A3A]">{value}</p>
    </div>
  );
}
