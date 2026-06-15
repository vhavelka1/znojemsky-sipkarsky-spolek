"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminNavigation } from "./AdminNavigation";
import { adminPageForPath, canAccessAdminPage, type AdminRole } from "@/lib/adminPages";
import { supabase } from "@/lib/supabase";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "allowed" | "blocked">("loading");
  const [displayName, setDisplayName] = useState("");
  const [blockMessage, setBlockMessage] = useState("");
  const [navigationItems, setNavigationItems] = useState<Array<{ href: string; label: string; minimumRole: AdminRole }>>([]);
  const isScoreboard = /^\/admin\/matches\/[^/]+\/scoreboard$/.test(pathname);

  useEffect(() => {
    let isMounted = true;
    const originalFetch = window.fetch.bind(window);

    async function verifyAdminAccess() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        router.replace(`/prihlaseni?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/admin")) {
          const headers = new Headers(init?.headers);
          headers.set("Authorization", `Bearer ${token}`);
          return originalFetch(input, { ...init, headers });
        }

        return originalFetch(input, init);
      }) as typeof window.fetch;

      const response = await originalFetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const body = (await response.json().catch(() => ({}))) as {
        user?: {
          displayName: string;
          canAccessAdmin: boolean;
          role: string;
          isActive: boolean;
        } | null;
      };

      if (!isMounted) return;

      if (!body.user?.isActive) {
        setBlockMessage("Uživatelský účet je deaktivovaný.");
        setAuthState("blocked");
        return;
      }

      if (!body.user?.canAccessAdmin) {
        setBlockMessage("Pro přístup do administrace nemáte oprávnění.");
        setAuthState("blocked");
        return;
      }

      const permissionsResponse = await originalFetch("/api/auth/admin-permissions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const permissionsBody = (await permissionsResponse.json().catch(() => ({}))) as {
        permissions?: Array<{ href: string; label: string; minimumRole: AdminRole }>;
      };
      const permissions = permissionsBody.permissions ?? [];
      const currentPage = adminPageForPath(pathname);
      const currentPermission = permissions.find((permission) => permission.href === currentPage.href);
      const minimumRole = currentPermission?.minimumRole ?? currentPage.defaultMinimumRole;

      if (!canAccessAdminPage(body.user.role, minimumRole)) {
        setBlockMessage("Pro přístup na tuto stránku nemáte oprávnění.");
        setAuthState("blocked");
        return;
      }

      setNavigationItems(
        permissions
          .filter((permission) => canAccessAdminPage(body.user!.role, permission.minimumRole))
          .map((permission) => ({ href: permission.href, label: permission.label, minimumRole: permission.minimumRole })),
      );
      setDisplayName(body.user.displayName);
      setAuthState("allowed");
    }

    void verifyAdminAccess();

    return () => {
      isMounted = false;
      window.fetch = originalFetch;
    };
  }, [pathname, router]);

  if (isScoreboard) {
    return <>{children}</>;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/");
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
            <div className="mt-5">
              <Link
                className="inline-flex w-full items-center justify-center rounded-full bg-white/15 px-5 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-white/25"
                href="/"
              >
                Zpět na web
              </Link>
            </div>
            {authState === "allowed" ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-bold text-blue-100/80">Přihlášen</p>
                <p className="mt-1 truncate text-sm font-black text-white">{displayName}</p>
                <button
                  className="mt-3 rounded-full bg-[#EF233C] px-3 py-1.5 text-xs font-black text-white hover:bg-red-500"
                  onClick={handleLogout}
                  type="button"
                >
                  Odhlásit
                </button>
              </div>
            ) : null}
          </div>
          <div className="admin-sidebar-nav">
            <AdminNavigation items={navigationItems} />
          </div>
        </aside>

        <section className="admin-content min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {authState === "loading" ? (
            <div className="admin-card p-6 text-sm font-bold text-slate-600">Ověřuji přístup do administrace...</div>
          ) : null}
          {authState === "blocked" ? (
            <div className="admin-card p-6">
              <h1 className="text-2xl font-black text-[var(--brand-navy)]">Přístup zamítnut</h1>
              <p className="mt-3 text-sm font-bold text-slate-600">{blockMessage}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" href="/muj-ucet">
                  Můj účet
                </Link>
                <button className="rounded-full border border-[var(--admin-border)] px-5 py-3 text-sm font-black" onClick={handleLogout} type="button">
                  Odhlásit
                </button>
              </div>
            </div>
          ) : null}
          {authState === "allowed" ? children : null}
        </section>
      </div>
    </main>
  );
}
