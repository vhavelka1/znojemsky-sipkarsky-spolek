"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

const inputClass =
  "min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#061A3A] outline-none transition focus:border-[#3B82F6]";

export default function IndividualRegistrationPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [residence, setResidence] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [lookingForTeam, setLookingForTeam] = useState(true);
  const [note, setNote] = useState("");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const response = await fetch("/api/public/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "player",
        website,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        residence,
        date_of_birth: dateOfBirth,
        looking_for_team: lookingForTeam,
        note,
        rules_accepted: rulesAccepted,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo odeslat.");
      return;
    }

    setMessage(body.message ?? "Žádost byla odeslána ke schválení.");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setResidence("");
    setDateOfBirth("");
    setLookingForTeam(true);
    setNote("");
    setRulesAccepted(false);
  }

  return (
    <PublicPageShell activeHref="/registrace">
      <PublicHero
        eyebrow="Registrace jednotlivce"
        title="Přihláška hráče"
        description="Vyplňte základní údaje hráče pro registraci do soutěží Znojemského šipkařského spolku."
      />

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-black text-[#0F4FA8] hover:text-[#EF233C]" href="/registrace">
          Zpět na výběr registrace
        </Link>

        <form className="mt-6 space-y-6 rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_18px_50px_rgba(6,26,58,0.10)] sm:p-7" onSubmit={submit}>
          {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800">{message}</div> : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}

          <input className="hidden" onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} value={website} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Jméno
              <input className={inputClass} onChange={(event) => setFirstName(event.target.value)} required value={firstName} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Příjmení
              <input className={inputClass} onChange={(event) => setLastName(event.target.value)} required value={lastName} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Email
              <input className={inputClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Telefon
              <input className={inputClass} onChange={(event) => setPhone(event.target.value)} value={phone} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Adresa
              <input className={inputClass} onChange={(event) => setResidence(event.target.value)} required value={residence} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Datum narození
              <input className={inputClass} onChange={(event) => setDateOfBirth(event.target.value)} required type="date" value={dateOfBirth} />
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm font-bold text-slate-700">
            <input className="mt-1 size-4" checked={lookingForTeam} onChange={(event) => setLookingForTeam(event.target.checked)} type="checkbox" />
            Hledám tým
          </label>

          <label className="grid gap-2 text-sm font-black text-[#061A3A]">
            Poznámka
            <textarea className={`${inputClass} min-h-28`} onChange={(event) => setNote(event.target.value)} value={note} />
          </label>

          <label className="flex items-start gap-3 text-sm font-bold text-slate-700">
            <input className="mt-1 size-4" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} required type="checkbox" />
            Souhlasím s pravidly soutěže a se zpracováním údajů pro účely registrace.
          </label>

          <button className="w-full rounded-full bg-[#EF233C] px-6 py-4 text-base font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Odesílám..." : "Odeslat žádost"}
          </button>
        </form>
      </section>
    </PublicPageShell>
  );
}
