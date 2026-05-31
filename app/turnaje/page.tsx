"use client";

import Image from "next/image";
import Link from "next/link";

type TournamentStatus = "preparing" | "registration_open" | "played";

type TournamentPreview = {
  id: string;
  name: string;
  category: string;
  date: string;
  place: string;
  status: TournamentStatus;
};

type TournamentCategory = {
  name: string;
  description: string;
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

const placeholderTournaments: TournamentPreview[] = [
  {
    id: "znojemsky-open-2026",
    name: "Znojemský Open 2026",
    category: "Major turnaj",
    date: "14. 6. 2026",
    place: "Znojmo",
    status: "preparing",
  },
  {
    id: "letni-turnaj-dvojic-2026",
    name: "Letní turnaj dvojic",
    category: "Dvojice",
    date: "21. 6. 2026",
    place: "Znojmo",
    status: "preparing",
  },
  {
    id: "damsky-sipkarsky-vecer-2026",
    name: "Dámský šipkařský večer",
    category: "Ženy",
    date: "28. 6. 2026",
    place: "Znojmo",
    status: "preparing",
  },
];

const tournamentCategories: TournamentCategory[] = [
  {
    name: "Mini turnaje",
    description: "Rychlé klubové turnaje pro pravidelné hraní a trénink.",
  },
  {
    name: "Major turnaje",
    description: "Větší bodované akce s širší účastí a slavnostnější atmosférou.",
  },
  {
    name: "Ženy",
    description: "Turnaje a večery zaměřené na ženskou šipkařskou komunitu.",
  },
  {
    name: "Dvojice",
    description: "Párové turnaje pro sehrané dvojice i nové kombinace hráčů.",
  },
  {
    name: "Jednotlivci",
    description: "Klasické soutěže jednotlivců napříč výkonnostními úrovněmi.",
  },
];

const statusLabels: Record<TournamentStatus, string> = {
  preparing: "připravuje se",
  registration_open: "otevřená registrace",
  played: "odehráno",
};

const statusClasses: Record<TournamentStatus, string> = {
  preparing: "bg-blue-50 text-[#0F4FA8] border-[#D8E4F2]",
  registration_open: "bg-red-50 text-[#EF233C] border-red-100",
  played: "bg-slate-100 text-slate-600 border-slate-200",
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
                  item.href === "/turnaje" ? "text-white" : "text-blue-100 hover:text-white"
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
              item.href === "/turnaje"
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

function TournamentCard({ tournament }: { tournament: TournamentPreview }) {
  return (
    <article className="group flex h-full flex-col rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(6,26,58,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-[#F4F8FF] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#0F4FA8]">
          {tournament.category}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses[tournament.status]}`}>
          {statusLabels[tournament.status]}
        </span>
      </div>
      <h3 className="mt-5 text-2xl font-black tracking-tight text-[#061A3A]">{tournament.name}</h3>
      <dl className="mt-5 grid gap-3 text-sm">
        <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
          <dt className="font-black text-slate-500">Datum</dt>
          <dd className="mt-1 font-black text-[#0B1F3A]">{tournament.date}</dd>
        </div>
        <div className="rounded-2xl bg-[#F4F8FF] px-4 py-3">
          <dt className="font-black text-slate-500">Místo</dt>
          <dd className="mt-1 font-black text-[#0B1F3A]">{tournament.place}</dd>
        </div>
      </dl>
      <div className="mt-auto pt-6">
        <Link
          className="inline-flex w-full items-center justify-center rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/10 transition hover:-translate-y-0.5 hover:bg-red-500"
          href={`/turnaje/${tournament.id}`}
        >
          Detail turnaje
        </Link>
      </div>
    </article>
  );
}

export default function PublicTournamentsPage() {
  const upcomingTournaments = placeholderTournaments.filter((tournament) => tournament.status !== "played");
  const playedTournaments = placeholderTournaments.filter((tournament) => tournament.status === "played");

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
            Šipkařské akce
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Turnaje</h1>
          <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">
            Mini, major, ženy, dvojice a další šipkařské akce.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_20px_60px_rgba(6,26,58,0.08)] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Připravujeme</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Turnaje zatím připravujeme.</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-slate-500">
              Registrace turnajů bude spuštěna později.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Program</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-[#061A3A]">Nejbližší turnaje</h2>
          </div>
          <Link className="rounded-full bg-[#0F4FA8] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#0B2F6B]" href="/kalendar">
            Kalendář akcí
          </Link>
        </div>

        {upcomingTournaments.length === 0 ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white px-6 py-8 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Turnaje zatím připravujeme.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <section className="rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Archiv</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Proběhlé turnaje</h2>
          </div>
          {playedTournaments.length === 0 ? (
            <p className="px-5 py-8 text-sm font-bold text-slate-500 sm:px-6">Zatím nejsou zadané žádné proběhlé turnaje.</p>
          ) : (
            <div className="divide-y divide-[#D8E4F2]">
              {playedTournaments.map((tournament) => (
                <div className="px-5 py-4 sm:px-6" key={tournament.id}>
                  <p className="font-black text-[#061A3A]">{tournament.name}</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">{tournament.date} / {tournament.place}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
          <div className="border-b border-[#D8E4F2] px-5 py-5 sm:px-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Přehled</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#061A3A]">Kategorie turnajů</h2>
          </div>
          <div className="grid gap-3 p-5 sm:p-6">
            {tournamentCategories.map((category) => (
              <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4" key={category.name}>
                <h3 className="text-lg font-black text-[#061A3A]">{category.name}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{category.description}</p>
              </div>
            ))}
          </div>
        </section>
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
