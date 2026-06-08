"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError("Nové heslo musí mít alespoň 8 znaků.");
      return;
    }

    if (password !== passwordAgain) {
      setError("Hesla se neshodují.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("Nové heslo se nepodařilo nastavit. Otevřete odkaz z emailu znovu.");
      return;
    }

    setMessage("Nové heslo bylo nastaveno.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#F4F8FF] px-4 py-10 text-[#0B1F3A]">
      <form className="w-full max-w-xl rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_24px_70px_rgba(6,26,58,0.12)] sm:p-8" onSubmit={handleSubmit}>
        <h1 className="text-4xl font-black text-[#061A3A]">Nastavit nové heslo</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-600">Zadejte nové heslo pro svůj účet.</p>
        {message ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-black text-[#061A3A]">
            Nové heslo
            <input className="min-h-12 rounded-2xl border border-[#D8E4F2] px-4 py-3 font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          <label className="grid gap-2 text-sm font-black text-[#061A3A]">
            Nové heslo znovu
            <input className="min-h-12 rounded-2xl border border-[#D8E4F2] px-4 py-3 font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setPasswordAgain(event.target.value)} type="password" value={passwordAgain} />
          </label>
        </div>
        <button className="mt-6 w-full rounded-full bg-[#EF233C] px-6 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" type="submit">
          Nastavit heslo
        </button>
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F4FA8]" href="/prihlaseni">Přejít na přihlášení</Link>
      </form>
    </main>
  );
}
