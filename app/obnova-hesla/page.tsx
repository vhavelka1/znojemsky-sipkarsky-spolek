"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.includes("@")) {
      setError("Zadejte platný email.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nastavit-heslo`,
    });

    if (resetError) {
      setError("Email pro obnovu hesla se nepodařilo odeslat.");
      return;
    }

    setMessage("Poslali jsme vám email pro nastavení nového hesla.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#F4F8FF] px-4 py-10 text-[#0B1F3A]">
      <form className="w-full max-w-xl rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_24px_70px_rgba(6,26,58,0.12)] sm:p-8" onSubmit={handleSubmit}>
        <h1 className="text-4xl font-black text-[#061A3A]">Obnova hesla</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-600">Zadejte email a pošleme vám odkaz pro nastavení nového hesla.</p>
        {message ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}
        <label className="mt-6 grid gap-2 text-sm font-black text-[#061A3A]">
          Email
          <input className="min-h-12 rounded-2xl border border-[#D8E4F2] px-4 py-3 font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
        </label>
        <button className="mt-6 w-full rounded-full bg-[#EF233C] px-6 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" type="submit">
          Odeslat obnovu hesla
        </button>
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F4FA8]" href="/prihlaseni">Zpět na přihlášení</Link>
      </form>
    </main>
  );
}
