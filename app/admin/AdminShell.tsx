"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminNavigation } from "./AdminNavigation";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const isScoreboard = /^\/admin\/matches\/[^/]+\/scoreboard$/.test(pathname);

  if (isScoreboard) {
    return <>{children}</>;
  }

  return (
    <main className="admin-shell min-h-screen">
      <div className="mx-auto flex max-w-[1480px] flex-col lg:flex-row">
        <aside className="admin-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0">
          <div className="admin-sidebar-brand">
            <Link
              aria-label="Zpět na hlavní stránku"
              className="admin-brand-link"
              href="/"
              title="Zpět na hlavní stránku"
            >
              <span className="admin-brand-logo">
                <Image
                  alt="Logo Znojemského šipkařského spolku"
                  className="h-full w-full object-contain"
                  height={884}
                  priority
                  src="/brand/zss-logo-official.png"
                  width={672}
                />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.7rem] font-black uppercase tracking-[0.16em] text-white">
                  Znojemský
                </span>
                <span className="block text-sm font-black uppercase tracking-[0.08em] text-[#3B82F6]">
                  Šipkařský spolek
                </span>
                <span className="mt-1 block text-xs font-bold text-blue-100/80">
                  Administrace ligy
                </span>
              </span>
            </Link>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-blue-100/70">
                Sportovní správa
              </p>
              <Link
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white hover:bg-white/20"
                href="/"
              >
                Zpět na web
              </Link>
            </div>
          </div>
          <div className="admin-sidebar-nav">
            <AdminNavigation />
          </div>
        </aside>

        <section className="admin-content min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </section>
      </div>
    </main>
  );
}
