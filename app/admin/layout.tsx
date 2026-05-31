import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { AdminNavigation } from "./AdminNavigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="admin-shell min-h-screen">
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        <aside className="admin-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0">
          <div className="admin-sidebar-brand">
            <Link
              aria-label="Zpět na hlavní stránku"
              className="admin-brand-link"
              href="/"
              title="Zpět na hlavní stránku"
            >
              <Image
                alt="Logo Znojemského šipkařského spolku"
                className="h-auto w-full object-contain"
                height={548}
                priority
                src="/brand/zss-logo-horizontal.png"
                width={1507}
              />
            </Link>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[var(--brand-coral)]">
                Sportovní správa
              </p>
              <Link
                className="text-xs font-bold text-[var(--brand-blue)] hover:text-[var(--brand-navy)]"
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
