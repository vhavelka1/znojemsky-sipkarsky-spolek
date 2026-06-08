"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AccountUser = {
  displayName: string;
  role: "guest" | "player" | "captain" | "moderator" | "admin";
  isActive: boolean;
  canAccessAdmin: boolean;
};

const roleLabels: Record<AccountUser["role"], string> = {
  guest: "Host",
  player: "Hráč",
  captain: "Kapitán",
  moderator: "Moderátor",
  admin: "Administrátor",
};

export default function MyAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadAccount() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/prihlaseni?redirect=/muj-ucet");
      return;
    }

    setEmail(data.session.user.email ?? "");
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
    const body = (await response.json().catch(() => ({}))) as { user?: AccountUser | null };
    setUser(body.user ?? null);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // Intentionally run once after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-[#F4F8FF] text-[#0B1F3A]">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-black text-[#0F4FA8]" href="/">Zpět na web</Link>
        <div className="mt-6 rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_24px_70px_rgba(6,26,58,0.12)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image alt="ZŠS" className="h-20 w-20 object-contain" height={256} src="/brand/zss-logo.png" width={256} />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Můj účet</p>
                <h1 className="mt-1 text-3xl font-black text-[#061A3A]">{isLoading ? "Načítám..." : user?.displayName ?? "Nepřihlášený uživatel"}</h1>
                <p className="mt-1 text-sm font-bold text-slate-600">{email}</p>
              </div>
            </div>
            <button className="rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" onClick={handleLogout} type="button">
              Odhlásit
            </button>
          </div>

          {user ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-[#F4F8FF] p-4">
                <p className="text-xs font-black uppercase text-slate-500">Role</p>
                <p className="mt-1 text-xl font-black">{roleLabels[user.role]}</p>
              </div>
              <div className="rounded-3xl bg-[#F4F8FF] p-4">
                <p className="text-xs font-black uppercase text-slate-500">Stav účtu</p>
                <p className="mt-1 text-xl font-black">{user.isActive ? "Aktivní" : "Deaktivovaný"}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
