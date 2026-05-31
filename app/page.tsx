"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

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

const navigationItems = [
  { href: "/", label: "Úvod" },
  { href: "/tabulky", label: "Tabulky" },
  { href: "/zapasy", label: "Zápasy" },
  { href: "/tymy", label: "Týmy" },
  { href: "/hraci", label: "Hráči" },
  { href: "/turnaje", label: "Turnaje" },
];

const featureTiles = [
  { href: "/tabulky", index: "01", title: "Týmová liga", text: "Tabulky, výsledky a rozpis týmové ligy.", tone: "blue" },
  { href: "/zapasy", index: "02", title: "Zápasy", text: "Rozpis utkání a poslední výsledky.", tone: "coral" },
  { href: "/hraci", index: "03", title: "Hráči", text: "Profily hráčů a individuální statistiky.", tone: "gold" },
  { href: "/turnaje", index: "04", title: "Turnaje", text: "Mini, major, ženy a dvojice.", tone: "blue" },
  { href: "/galerie", index: "05", title: "Galerie", text: "Fotky a videa ze šipkařských akcí.", tone: "coral" },
  { href: "/kalendar", index: "06", title: "Kalendář akcí", text: "Ligová kola, turnaje a klubové akce.", tone: "gold" },
];

const emptyPayload: HomepagePayload = {
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
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[rgba(107,143,191,0.2)] bg-white p-1"
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
        <span className="text-xs font-extrabold text-[var(--brand-navy)]">{team.name.charAt(0)}</span>
      )}
    </div>
  );
}

function SectionHeader({ eyebrow, title, link }: { eyebrow: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--brand-coral)]">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-extrabold text-[var(--brand-navy)] sm:text-3xl">{title}</h2>
      </div>
      {link ? (
        <Link className="text-sm font-bold text-[var(--brand-blue)] transition-colors hover:text-[var(--brand-navy)]" href={link.href}>
          {link.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [payload, setPayload] = useState<HomepagePayload>(emptyPayload);
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
        setPayload(body);
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

  return (
    <main className="min-h-screen bg-[#f8fbff] text-[var(--brand-navy)]">
      <header className="sticky top-0 z-20 border-b border-[rgba(107,143,191,0.16)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6 lg:px-8">
          <Link aria-label="Znojemský šipkařský spolek" className="block w-40 sm:w-52" href="/">
            <Image alt="Logo Znojemského šipkařského spolku" height={548} priority src="/brand/zss-logo-horizontal.png" width={1507} />
          </Link>
          <div className="flex min-w-0 items-center gap-4">
            <nav className="hidden items-center gap-5 lg:flex">
              {navigationItems.map((item) => (
                <Link className="text-sm font-bold text-[#4e6075] transition-colors hover:text-[var(--brand-navy)]" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link className="shrink-0 rounded-xl border border-[rgba(107,143,191,0.35)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--brand-navy)] shadow-sm transition hover:-translate-y-px hover:bg-[#eef5fc] sm:px-4 sm:text-sm" href="/admin">
              Administrace
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 pb-3 lg:hidden">
          {navigationItems.map((item) => (
            <Link className="whitespace-nowrap text-sm font-bold text-[#4e6075]" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="relative isolate overflow-hidden border-b border-[rgba(107,143,191,0.18)] bg-[#edf5fc]">
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-10 -z-10 h-[390px] w-auto opacity-[0.11] sm:right-4 sm:h-[520px] lg:right-[7%] lg:top-5 lg:h-[600px]"
          height={1121}
          priority
          src="/brand/zss-logo-stacked.png"
          width={884}
        />
        <div className="mx-auto flex min-h-[500px] max-w-7xl flex-col justify-center px-4 py-12 sm:min-h-[560px] sm:px-6 lg:px-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--brand-coral)]">Znojemský šipkařský spolek</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.05] text-[var(--brand-navy)] sm:text-6xl lg:text-7xl">
            Oficiální systém týmové ligy a turnajů
          </h1>
          <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-[#51657d] sm:text-lg">
            Výsledky, tabulky, rozpisy a dění z regionální šipkařské scény na jednom místě.
          </p>
          <div className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(107,143,191,0.3)] bg-white/80 px-4 py-2 text-sm font-extrabold shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[var(--brand-coral)]" />
            {isLoading ? "Načítám aktuální sezónu..." : payload.activeSeason?.name ?? "Aktivní sezóna zatím není vybraná"}
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:gap-5">
            {[
              ["Týmů", payload.counts.teams],
              ["Hráčů", payload.counts.players],
              ["Odehraných zápasů", payload.counts.playedMatches],
            ].map(([label, value]) => (
              <div className="border-l-2 border-[var(--brand-gold)] pl-3 sm:pl-4" key={label}>
                <p className="text-2xl font-black sm:text-4xl">{isLoading ? "–" : value}</p>
                <p className="mt-1 text-[0.68rem] font-bold leading-4 text-[#61738a] sm:text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <SectionHeader eyebrow="Rozcestník" title="Vše podstatné pro šipkařskou sezónu" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureTiles.map((tile) => (
            <Link className={`public-feature-card public-feature-card-${tile.tone}`} href={tile.href} key={tile.href}>
              <p className="text-xs font-black text-[var(--brand-coral)]">{tile.index}</p>
              <h3 className="mt-7 text-xl font-extrabold">{tile.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#607289]">{tile.text}</p>
              <span className="mt-7 inline-block text-lg font-black text-[var(--brand-blue)]" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {error ? (
        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</div>
        </section>
      ) : null}

      <section className="border-y border-[rgba(107,143,191,0.16)] bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionHeader eyebrow="Liga" title="Poslední výsledky" link={{ href: "/zapasy", label: "Všechny zápasy" }} />
            <div className="mt-6 divide-y divide-[rgba(107,143,191,0.17)]">
              {isLoading ? <p className="py-5 text-sm text-[#607289]">Načítám výsledky...</p> : null}
              {!isLoading && payload.latestResults.length === 0 ? <p className="py-5 text-sm text-[#607289]">Zatím nejsou zadané žádné výsledky.</p> : null}
              {payload.latestResults.map((match) => (
                <div className="py-4" key={match.id}>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#7b8ba0]">{formatDate(match.playedAt ?? match.scheduledAt)}</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo team={match.homeTeam} size={38} />
                      <p className="text-sm font-extrabold leading-5">{match.homeTeam.name}</p>
                    </div>
                    <p className="rounded-lg bg-[#eef5fc] px-3 py-2 text-lg font-black">
                      {match.result?.homePoints}:{match.result?.awayPoints}
                    </p>
                    <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                      <p className="text-sm font-extrabold leading-5">{match.awayTeam.name}</p>
                      <TeamLogo team={match.awayTeam} size={38} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionHeader eyebrow="Program" title="Nejbližší zápasy" link={{ href: "/zapasy", label: "Celý rozpis" }} />
            <div className="mt-6 divide-y divide-[rgba(107,143,191,0.17)]">
              {isLoading ? <p className="py-5 text-sm text-[#607289]">Načítám rozpis...</p> : null}
              {!isLoading && payload.upcomingMatches.length === 0 ? <p className="py-5 text-sm text-[#607289]">Nejsou naplánované žádné zápasy.</p> : null}
              {payload.upcomingMatches.map((match) => (
                <div className="grid grid-cols-[auto_1fr] gap-4 py-4" key={match.id}>
                  <p className="w-20 text-xs font-extrabold leading-5 text-[var(--brand-coral)]">{formatDateTime(match.scheduledAt)}</p>
                  <div className="space-y-2">
                    {[match.homeTeam, match.awayTeam].map((team) => (
                      <div className="flex items-center gap-2" key={team.name}>
                        <TeamLogo team={team} size={30} />
                        <p className="text-sm font-extrabold">{team.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow={payload.activeCompetition ? `${payload.activeCompetition.leagueName} · ${payload.activeCompetition.groupName}` : "Týmová liga"} title="Čelo tabulky" link={{ href: "/tabulky", label: "Zobrazit celou tabulku" }} />
        <div className="mt-7 overflow-hidden rounded-2xl border border-[rgba(107,143,191,0.2)] bg-white shadow-[0_16px_40px_rgba(35,54,77,0.06)]">
          {isLoading ? <p className="px-5 py-6 text-sm text-[#607289]">Načítám tabulku...</p> : null}
          {!isLoading && payload.standings.length === 0 ? <p className="px-5 py-6 text-sm text-[#607289]">Tabulka zatím není dostupná.</p> : null}
          {payload.standings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-[#eef5fc] text-xs font-extrabold text-[#61738a]">
                  <tr><th className="px-5 py-4">Pořadí</th><th className="px-5 py-4">Tým</th><th className="px-5 py-4 text-right">Zápasy</th><th className="px-5 py-4 text-right">Výhry</th><th className="px-5 py-4 text-right">Skóre</th><th className="px-5 py-4 text-right">Body</th></tr>
                </thead>
                <tbody className="divide-y divide-[rgba(107,143,191,0.15)]">
                  {payload.standings.map((row, index) => (
                    <tr key={row.teamSeasonId}>
                      <td className="px-5 py-4 text-base font-black text-[var(--brand-coral)]">{index + 1}.</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <TeamLogo team={{ name: row.teamName, logoUrl: row.logoUrl }} size={34} />
                          <span className="font-extrabold">{row.teamName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-bold">{row.played}</td>
                      <td className="px-5 py-4 text-right font-bold">{row.wins}</td>
                      <td className="px-5 py-4 text-right font-bold">{row.scoreFor}:{row.scoreAgainst}</td>
                      <td className="px-5 py-4 text-right text-base font-black">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="border-t border-[rgba(107,143,191,0.18)] bg-[var(--brand-navy)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p className="font-bold">Znojemský šipkařský spolek</p>
          <p className="text-[#b7cce8]">Výsledky, tabulky a dění ze znojemských šipek.</p>
        </div>
      </footer>
    </main>
  );
}
