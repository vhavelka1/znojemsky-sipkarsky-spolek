"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!email.includes("@")) {
      setError("Zadejte platný email.");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků.");
      setIsSubmitting(false);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.session) {
      setError("Přihlášení se nepodařilo. Zkontrolujte email a heslo.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
    const body = (await response.json().catch(() => ({}))) as {
      user?: { canAccessAdmin: boolean; role: string } | null;
    };

    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (redirect?.startsWith("/admin") && body.user?.canAccessAdmin) {
      router.replace(redirect);
      return;
    }

    router.replace(body.user?.canAccessAdmin ? "/admin" : "/muj-ucet");
  }

  return (
    <main className="min-h-screen bg-[#F4F8FF] text-[#0B1F3A]">
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden lg:block">
          <Image alt="ZŠS" className="mx-auto h-auto w-80 drop-shadow-2xl" height={884} src="/brand/zss-logo.png" width={672} />
        </div>
        <form className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_24px_70px_rgba(6,26,58,0.12)] sm:p-8" onSubmit={handleSubmit}>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#EF233C]">Znojemský šipkařský spolek</p>
          <h1 className="mt-2 text-4xl font-black text-[#061A3A]">Přihlášení</h1>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-600">Přihlaste se pro administraci, účet hráče a komentování.</p>
          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Email
              <input className="min-h-12 rounded-2xl border border-[#D8E4F2] px-4 py-3 font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Heslo
              <input className="min-h-12 rounded-2xl border border-[#D8E4F2] px-4 py-3 font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
          </div>
          <button className="mt-6 w-full rounded-full bg-[#EF233C] px-6 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500 disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Přihlašuji..." : "Přihlásit se"}
          </button>
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm font-bold">
            <Link className="text-[#0F4FA8]" href="/obnova-hesla">Zapomenuté heslo</Link>
            <Link className="text-slate-500" href="/">Zpět na web</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
