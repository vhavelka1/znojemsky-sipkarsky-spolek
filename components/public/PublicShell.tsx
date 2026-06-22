"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type PublicUser = {
  displayName: string;
  role: string;
  isActive: boolean;
  canAccessAdmin: boolean;
};

const baseNavigationItems = [
  { href: "/", label: "Úvod" },
  { href: "/tabulky", label: "Liga" },
  { href: "/turnaje", label: "Turnaje" },
  { href: "/kalendar", label: "Kalendář" },
  { href: "/hraci", label: "Hráči" },
  { href: "/tymy", label: "Týmy" },
  { href: "/galerie", label: "Galerie" },
  { href: "/scoreboard", label: "Počítadlo" },
  { href: "/diskuze", label: "Diskuze" },
  { href: "/kontakt", label: "Kontakt" },
];

async function loadPublicUser() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const response = await fetch("/api/auth/me", {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { user?: PublicUser | null };
  return body.user ?? null;
}

export function PublicHeader({ activeHref = "/" }: { activeHref?: string }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  };

  useEffect(() => {
    let isMounted = true;

    loadPublicUser()
      .then((loadedUser) => {
        if (!isMounted) return;
        setUser(loadedUser);
        setIsAuthLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setUser(null);
        setIsAuthLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadPublicUser()
        .then((loadedUser) => setUser(loadedUser))
        .catch(() => setUser(null));
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const navigationItems = useMemo(
    () => (user ? [...baseNavigationItems, { href: "/admin", label: "Administrace" }] : baseNavigationItems),
    [user],
  );

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
                  item.href === activeHref ? "text-white" : "text-blue-100 hover:text-white"
                }`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {isAuthLoading ? (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-blue-100">
              Načítám...
            </span>
          ) : user ? (
            <div className="shrink-0 text-right leading-tight">
              <Link
                className="block rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-black text-[#061A3A] shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:bg-blue-50"
                href="/muj-ucet"
                title="Můj účet"
              >
                {user.displayName}
              </Link>
              <button
                className="mt-1 text-xs font-black text-blue-100 transition hover:text-white"
                onClick={signOut}
                type="button"
              >
                Odhlásit
              </button>
            </div>
          ) : (
            <Link
              className="shrink-0 rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-950/25 transition hover:-translate-y-0.5 hover:bg-red-500"
              href="/prihlaseni"
            >
              Přihlášení
            </Link>
          )}
        </div>
      </div>

      <nav className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-3 sm:px-6 xl:hidden">
        {navigationItems.map((item) => (
          <Link
            className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-bold ${
              item.href === activeHref
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

export function PublicFooter() {
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
          <Link href="/tymy">Týmy</Link>
          <Link href="/turnaje">Turnaje</Link>
          <Link href="/prihlaseni">Přihlášení</Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicPageShell({
  activeHref,
  children,
}: {
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F4F8FF] text-[#0B1F3A]">
      <PublicHeader activeHref={activeHref} />
      {children}
      <PublicFooter />
    </main>
  );
}

export function PublicHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
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
          {eyebrow}
        </p>
        <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-xl font-bold leading-8 text-blue-100">{description}</p>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}

