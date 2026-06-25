"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";

type MatchTeam = {
  name: string;
  logoUrl: string | null;
};

type MatchPreview = {
  id: string;
  scheduledAt: string;
  playedAt: string | null;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  result: {
    homePoints: number;
    awayPoints: number;
  } | null;
};

type StandingRow = {
  teamSeasonId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
};

type HomepagePayload = {
  homepageSettings: {
    kicker: string;
    title: string;
    subtitle: string;
  };
  activeSeason: { id: string; name: string } | null;
  activeCompetition: { leagueName: string; groupName: string } | null;
  counts: {
    teams: number;
    players: number;
    playedMatches: number;
  };
  latestResults: MatchPreview[];
  upcomingMatches: MatchPreview[];
  standings: StandingRow[];
  error?: string;
};

type HomepageUser = {
  canManageOwnTeam: boolean;
};

const quickLinks = [
  { href: "/tabulky", label: "Tabulky", primary: true },
  { href: "/zapasy", label: "Zápasy", primary: false },
  { href: "/scoreboard", label: "Počítadlo", primary: false },
  { href: "/turnaje", label: "Turnaje", primary: false },
];

const galleryPlaceholders = [
  "from-[#061A3A] via-[#0F4FA8] to-[#EF233C]",
  "from-[#0B2F6B] via-[#3B82F6] to-[#061A3A]",
  "from-[#EF233C] via-[#0F4FA8] to-[#0B1F3A]",
];

const emptyPayload: HomepagePayload = {
  homepageSettings: {
    kicker: "Regionální šipková liga",
    title: "Znojemský šipkařský spolek",
    subtitle: "Oficiální systém lig, turnajů a statistik.",
  },
  activeSeason: null,
  activeCompetition: null,
  counts: { teams: 0, players: 0, playedMatches: 0 },
  latestResults: [],
  upcomingMatches: [],
  standings: [],
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TeamLogo({ team, size = 42 }: { team: MatchTeam; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-white p-1 shadow-sm"
      style={{ height: size, width: size }}
    >
      {team.logoUrl ? (
        <Image
          alt={`Logo ${team.name}`}
          className="h-full w-full object-contain"
          height={size}
          src={team.logoUrl}
          unoptimized
          width={size}
        />
      ) : (
        <span className="text-sm font-black text-[#0B2F6B]">{team.name.charAt(0)}</span>
      )}
    </div>
  );
}

function PortalCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)] ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({
  kicker,
  title,
  href,
  action,
}: {
  kicker?: string;
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
      <div>
        {kicker ? <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">{kicker}</p> : null}
        <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">{title}</h2>
      </div>
      {href && action ? (
        <Link className="rounded-full bg-[#0F4FA8] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#0B2F6B]" href={href}>
          {action}
        </Link>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm font-semibold text-[#64748b] sm:px-6">{children}</p>;
}

export default function Home() {
  const [payload, setPayload] = useState<HomepagePayload>(emptyPayload);
  const [user, setUser] = useState<HomepageUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/public/homepage")
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as HomepagePayload;
        if (!response.ok) throw new Error(body.error ?? "Veřejný přehled se nepodařilo načíst.");
        return body;
      })
      .then((body) => {
        if (!isMounted) return;
        setPayload({
          ...emptyPayload,
          ...body,
          homepageSettings: body.homepageSettings ?? emptyPayload.homepageSettings,
        });
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Veřejný přehled se nepodařilo načíst.");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (isMounted) setUser(null);
        return;
      }

      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const body = (await response.json().catch(() => ({}))) as { user?: HomepageUser | null };
      if (isMounted) setUser(body.user ?? null);
    }

    loadUser().catch(() => {
      if (isMounted) setUser(null);
    });

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadUser().catch(() => setUser(null));
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const featuredTeams = useMemo(() => {
    const teams = new Map<string, MatchTeam>();
    payload.standings.forEach((row) => {
      teams.set(row.teamName, { name: row.teamName, logoUrl: row.logoUrl });
    });
    [...payload.latestResults, ...payload.upcomingMatches].forEach((match) => {
      teams.set(match.homeTeam.name, match.homeTeam);
      teams.set(match.awayTeam.name, match.awayTeam);
    });
    return Array.from(teams.values()).slice(0, 8);
  }, [payload.latestResults, payload.standings, payload.upcomingMatches]);

  const tableTitle = payload.activeCompetition
    ? `Tabulka - ${payload.activeCompetition.groupName}`
    : "Tabulka ligy";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader activeHref="/" />

      <section className="relative isolate overflow-hidden bg-[#061A3A] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.36),transparent_34%),radial-gradient(circle_at_85%_35%,rgba(239,35,60,0.26),transparent_30%),linear-gradient(135deg,#061A3A_0%,#0B2F6B_48%,#061A3A_100%)]" />
        <div className="absolute -left-24 top-20 -z-10 h-64 w-64 rounded-full border-[34px] border-white/5" />
        <div className="absolute right-[-90px] top-10 -z-10 h-[420px] w-[420px] rounded-full border-[42px] border-[#EF233C]/10" />
        <div className="mx-auto grid min-h-[650px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
              {payload.homepageSettings.kicker}
            </p>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.96] tracking-tight sm:text-6xl lg:text-7xl">
              {payload.homepageSettings.title}
            </h1>
            <p className="mt-6 max-w-2xl text-xl font-bold leading-8 text-blue-100">
              {payload.homepageSettings.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {quickLinks.map((item) => (
                <Link
                  className={`rounded-full px-6 py-3 text-base font-black shadow-xl transition hover:-translate-y-0.5 ${
                    item.primary
                      ? "bg-[#EF233C] text-white shadow-red-950/25 hover:bg-red-500"
                      : "bg-white text-[#061A3A] shadow-black/15 hover:bg-blue-50"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
              {user?.canManageOwnTeam ? (
                <Link
                  className="rounded-full bg-[#0F4FA8] px-6 py-3 text-base font-black text-white shadow-xl shadow-blue-950/25 transition hover:-translate-y-0.5 hover:bg-[#3B82F6]"
                  href="/muj-tym"
                >
                  Můj tým
                </Link>
              ) : null}
            </div>
            <div className="mt-8 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 font-bold text-blue-50">
              <span className="h-3 w-3 rounded-full bg-[#EF233C] shadow-[0_0_0_5px_rgba(239,35,60,0.18)]" />
              {isLoading ? "Načítám aktuální sezónu..." : payload.activeSeason?.name ?? "Aktivní sezóna zatím není vybraná"}
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:gap-5">
              {[
                ["Týmů", payload.counts.teams],
                ["Hráčů", payload.counts.players],
                ["Zápasů", payload.counts.playedMatches],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur" key={label}>
                  <p className="text-3xl font-black sm:text-4xl">{isLoading ? "-" : value}</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-100">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-[520px] items-center justify-center lg:max-w-none">
            <div className="absolute inset-0 rounded-full bg-[#3B82F6]/20 blur-3xl" />
            <Image
              alt="Logo Znojemského šipkařského spolku"
              className="relative z-10 h-auto w-[78%] max-w-[430px] drop-shadow-[0_35px_50px_rgba(0,0,0,0.45)]"
              height={900}
              priority
              src="/brand/zss-logo-official.png"
              width={700}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 m-auto h-auto w-[95%] max-w-[560px] opacity-[0.08]"
              height={900}
              src="/brand/zss-logo-official.png"
              width={700}
            />
          </div>
        </div>
      </section>

      {error ? (
        <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        </section>
      ) : null}

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-14">
        <PortalCard>
          <CardHeader
            action="Celá tabulka"
            href="/tabulky"
            kicker={payload.activeCompetition?.leagueName ?? "Liga"}
            title={tableTitle}
          />
          {isLoading ? <EmptyState>Načítám tabulku...</EmptyState> : null}
          {!isLoading && payload.standings.length === 0 ? <EmptyState>Tabulka zatím není dostupná.</EmptyState> : null}
          {payload.standings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-[#F4F8FF] text-xs font-black uppercase tracking-[0.1em] text-[#64748b]">
                  <tr>
                    <th className="px-5 py-4">#</th>
                    <th className="px-5 py-4">Tým</th>
                    <th className="px-5 py-4 text-right">Z</th>
                    <th className="px-5 py-4 text-right">V</th>
                    <th className="px-5 py-4 text-right">Skóre</th>
                    <th className="px-5 py-4 text-right">Body</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E4F2]">
                  {payload.standings.map((row, index) => (
                    <tr className="transition hover:bg-[#F4F8FF]" key={row.teamSeasonId}>
                      <td className="px-5 py-4 text-lg font-black text-[#EF233C]">{index + 1}.</td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <TeamLogo team={{ name: row.teamName, logoUrl: row.logoUrl }} size={40} />
                          <span className="font-black text-[#061A3A]">{row.teamName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-bold">{row.played}</td>
                      <td className="px-5 py-4 text-right font-bold">{row.wins}</td>
                      <td className="px-5 py-4 text-right font-bold">{row.scoreFor}:{row.scoreAgainst}</td>
                      <td className="px-5 py-4 text-right text-lg font-black text-[#061A3A]">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </PortalCard>

        <PortalCard>
          <CardHeader action="Všechny zápasy" href="/zapasy" kicker="Výsledky" title="Poslední zápasy" />
          <div className="divide-y divide-[#D8E4F2]">
            {isLoading ? <EmptyState>Načítám výsledky...</EmptyState> : null}
            {!isLoading && payload.latestResults.length === 0 ? <EmptyState>Zatím nejsou zadané žádné výsledky.</EmptyState> : null}
            {payload.latestResults.slice(0, 4).map((match) => (
              <div className="px-5 py-4 sm:px-6" key={match.id}>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">{formatDate(match.playedAt ?? match.scheduledAt)}</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo team={match.homeTeam} size={34} />
                    <p className="min-w-0 truncate text-sm font-black">{match.homeTeam.name}</p>
                  </div>
                  <p className="rounded-xl bg-[#061A3A] px-3 py-2 text-lg font-black text-white">
                    {match.result?.homePoints}:{match.result?.awayPoints}
                  </p>
                  <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                    <p className="min-w-0 truncate text-sm font-black">{match.awayTeam.name}</p>
                    <TeamLogo team={match.awayTeam} size={34} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PortalCard>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <PortalCard>
          <CardHeader action="Celý rozpis" href="/zapasy" kicker="Program" title="Nejbližší zápasy" />
          <div className="divide-y divide-[#D8E4F2]">
            {isLoading ? <EmptyState>Načítám rozpis...</EmptyState> : null}
            {!isLoading && payload.upcomingMatches.length === 0 ? <EmptyState>Nejsou naplánované žádné zápasy.</EmptyState> : null}
            {payload.upcomingMatches.slice(0, 4).map((match) => (
              <div className="px-5 py-4 sm:px-6" key={match.id}>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#EF233C]">{formatDateTime(match.scheduledAt)}</p>
                <div className="mt-3 space-y-2">
                  {[match.homeTeam, match.awayTeam].map((team) => (
                    <div className="flex min-w-0 items-center gap-2" key={`${match.id}:${team.name}`}>
                      <TeamLogo team={team} size={30} />
                      <p className="min-w-0 truncate text-sm font-black">{team.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PortalCard>

        <section className="relative overflow-hidden rounded-[28px] bg-[#061A3A] p-6 text-white shadow-[0_20px_60px_rgba(6,26,58,0.18)]">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#EF233C]/25 blur-2xl" />
          <Image
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-10 h-auto w-48 opacity-10"
            height={700}
            src="/brand/zss-logo-official.png"
            width={560}
          />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3B82F6]">Registrace</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Registrace do sezóny</h2>
            <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-blue-100">
              Přihlaste tým do ligy nebo pošlete individuální přihlášku hráče pro další sezónu ZŠS.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="rounded-full bg-[#EF233C] px-5 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" href="/registrace/tym">
                Registrovat tým
              </Link>
              <Link className="rounded-full bg-white px-5 py-3 font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50" href="/registrace/jednotlivec">
                Registrovat jednotlivce
              </Link>
            </div>
          </div>
        </section>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <PortalCard>
          <CardHeader action="Všichni hráči" href="/hraci" kicker="Statistiky" title="Nejlepší hráči" />
          <EmptyState>Individuální žebříčky budou dostupné po doplnění hráčských statistik.</EmptyState>
        </PortalCard>

        <PortalCard>
          <CardHeader action="Zobrazit týmy" href="/tymy" kicker="Liga" title="Týmy" />
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {isLoading ? <p className="text-sm font-semibold text-[#64748b]">Načítám týmy...</p> : null}
            {!isLoading && featuredTeams.length === 0 ? <p className="text-sm font-semibold text-[#64748b]">Týmy zatím nejsou dostupné.</p> : null}
            {featuredTeams.map((team) => (
              <div className="flex min-w-0 items-center gap-3 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-3" key={team.name}>
                <TeamLogo team={team} size={44} />
                <p className="min-w-0 truncate font-black text-[#061A3A]">{team.name}</p>
              </div>
            ))}
          </div>
        </PortalCard>
      </section>

      <section className="border-y border-[#D8E4F2] bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-3 lg:px-8">
          <PortalCard>
            <CardHeader action="Všechny turnaje" href="/turnaje" kicker="Turnaje" title="Turnaje" />
            <EmptyState>Turnajový modul připravujeme. Brzy zde najdeš major a mini turnaje.</EmptyState>
          </PortalCard>

          <PortalCard>
            <CardHeader action="Zobrazit galerii" href="/galerie" kicker="Galerie" title="Galerie" />
            <div className="grid grid-cols-3 gap-3 p-5 sm:p-6">
              {galleryPlaceholders.map((gradient, index) => (
                <div className={`aspect-square rounded-3xl bg-gradient-to-br ${gradient} shadow-inner`} key={gradient}>
                  <span className="flex h-full items-end p-3 text-xl font-black text-white/90">{index + 1}</span>
                </div>
              ))}
            </div>
          </PortalCard>

          <section className="relative overflow-hidden rounded-[28px] bg-[#0B2F6B] p-6 text-white shadow-[0_20px_60px_rgba(6,26,58,0.18)]">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#3B82F6]/30 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Volná hra</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Počítadlo</h2>
              <p className="mt-4 text-base font-bold leading-7 text-blue-100">
                Rychlé zadávání skóre pro neoficiální zápasy, trénink nebo hospodskou hru.
              </p>
              <Link className="mt-7 inline-flex rounded-full bg-white px-5 py-3 font-black text-[#061A3A] transition hover:-translate-y-0.5 hover:bg-blue-50" href="/scoreboard">
                Otevřít Počítadlo
              </Link>
            </div>
          </section>
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
            <Link href="/tabulky">Tabulky</Link>
            <Link href="/zapasy">Zápasy</Link>
            <Link href="/turnaje">Turnaje</Link>
            <Link href="/prihlaseni">Přihlášení</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}


