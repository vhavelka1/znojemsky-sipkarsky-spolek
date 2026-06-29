"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

type MetaPayload = {
  activeSeasonId?: string | null;
  teamRegistrationIntro?: string;
  competitionRulesFileName?: string;
  competitionRulesFileUrl?: string;
  error?: string;
};
type RosterPlayer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  date_of_birth: string;
  note: string;
};

const emptyPlayer: RosterPlayer = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  date_of_birth: "",
  note: "",
};

const inputClass =
  "min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#061A3A] outline-none transition focus:border-[#3B82F6]";

function requiredInputClass(value: string) {
  return value.trim() ? inputClass : `${inputClass} border-[#EF233C] bg-red-50 focus:border-[#EF233C]`;
}

export default function TeamRegistrationPage() {
  const [teamRegistrationIntro, setTeamRegistrationIntro] = useState("");
  const [competitionRulesFileName, setCompetitionRulesFileName] = useState("");
  const [competitionRulesFileUrl, setCompetitionRulesFileUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [captainAddress, setCaptainAddress] = useState("");
  const [captainDateOfBirth, setCaptainDateOfBirth] = useState("");
  const [assistantCaptainName, setAssistantCaptainName] = useState("");
  const [assistantCaptainEmail, setAssistantCaptainEmail] = useState("");
  const [assistantCaptainPhone, setAssistantCaptainPhone] = useState("");
  const [assistantCaptainAddress, setAssistantCaptainAddress] = useState("");
  const [assistantCaptainDateOfBirth, setAssistantCaptainDateOfBirth] = useState("");
  const [wantsMajorTournament, setWantsMajorTournament] = useState(false);
  const [note, setNote] = useState("");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [roster, setRoster] = useState<RosterPlayer[]>([{ ...emptyPlayer }]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/public/registrations", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as MetaPayload;
        if (!response.ok) throw new Error(body.error ?? "Data pro registraci se nepodařilo načíst.");
        setTeamRegistrationIntro(body.teamRegistrationIntro ?? "");
        setCompetitionRulesFileName(body.competitionRulesFileName ?? "");
        setCompetitionRulesFileUrl(body.competitionRulesFileUrl ?? "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Data pro registraci se nepodařilo načíst."));
  }, []);

  function updateRoster(index: number, patch: Partial<RosterPlayer>) {
    setRoster((current) => current.map((player, itemIndex) => (itemIndex === index ? { ...player, ...patch } : player)));
  }

  function removeRosterPlayer(index: number) {
    setRoster((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/public/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "team",
        website,
        team_name: teamName,
        captain_name: captainName,
        captain_email: captainEmail,
        captain_phone: captainPhone,
        captain_address: captainAddress,
        captain_date_of_birth: captainDateOfBirth,
        assistant_captain_name: assistantCaptainName,
        assistant_captain_email: assistantCaptainEmail,
        assistant_captain_phone: assistantCaptainPhone,
        assistant_captain_address: assistantCaptainAddress,
        assistant_captain_date_of_birth: assistantCaptainDateOfBirth,
        wants_major_tournament: wantsMajorTournament,
        note,
        rules_accepted: rulesAccepted,
        roster,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo odeslat.");
      return;
    }

    setMessage(body.message ?? "Žádost byla odeslána ke schválení.");
    setTeamName("");
    setCaptainName("");
    setCaptainEmail("");
    setCaptainPhone("");
    setCaptainAddress("");
    setCaptainDateOfBirth("");
    setAssistantCaptainName("");
    setAssistantCaptainEmail("");
    setAssistantCaptainPhone("");
    setAssistantCaptainAddress("");
    setAssistantCaptainDateOfBirth("");
    setWantsMajorTournament(false);
    setNote("");
    setRulesAccepted(false);
    setRoster([{ ...emptyPlayer }]);
  }

  return (
    <PublicPageShell activeHref="/registrace">
      <PublicHero
        eyebrow="Registrace týmu"
        title="Přihláška týmu"
        description="Vyplňte základní údaje o týmu, kapitánovi a soupisku hráčů pro nadcházející sezónu."
      />

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-black text-[#0F4FA8] hover:text-[#EF233C]" href="/registrace">
          Zpět na výběr registrace
        </Link>

        <form className="mt-6 space-y-6 rounded-[28px] border border-[#D8E4F2] bg-white p-5 shadow-[0_18px_50px_rgba(6,26,58,0.10)] sm:p-7" onSubmit={submit}>
          {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800">{message}</div> : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}
          {teamRegistrationIntro ? (
            <div className="whitespace-pre-line rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-5 text-sm font-bold leading-7 text-[#061A3A]">
              {teamRegistrationIntro}
            </div>
          ) : null}

          <input className="hidden" onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} value={website} />

          <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-5">
            <h2 className="text-xl font-black text-[#061A3A]">Údaje týmu</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Název týmu
                <input className={requiredInputClass(teamName)} onChange={(event) => setTeamName(event.target.value)} required value={teamName} />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-black text-[#061A3A] md:self-end">
                <input
                  checked={wantsMajorTournament}
                  className="size-4"
                  onChange={(event) => setWantsMajorTournament(event.target.checked)}
                  type="checkbox"
                />
                Tým má zájem pořádat Major turnaj
              </label>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-[#D8E4F2] bg-white p-5 shadow-[0_12px_32px_rgba(6,26,58,0.06)]">
              <div>
                <h2 className="text-xl font-black text-[#061A3A]">Kapitán</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">Hlavní kontaktní osoba týmu.</p>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Jméno a příjmení
                  <input className={requiredInputClass(captainName)} onChange={(event) => setCaptainName(event.target.value)} required value={captainName} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Email
                  <input className={requiredInputClass(captainEmail)} onChange={(event) => setCaptainEmail(event.target.value)} required type="email" value={captainEmail} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Telefon
                  <input className={inputClass} onChange={(event) => setCaptainPhone(event.target.value)} value={captainPhone} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Datum narození
                  <input className={requiredInputClass(captainDateOfBirth)} onChange={(event) => setCaptainDateOfBirth(event.target.value)} required type="date" value={captainDateOfBirth} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Adresa
                  <input className={requiredInputClass(captainAddress)} onChange={(event) => setCaptainAddress(event.target.value)} required value={captainAddress} />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-[#D8E4F2] bg-white p-5 shadow-[0_12px_32px_rgba(6,26,58,0.06)]">
              <div>
                <h2 className="text-xl font-black text-[#061A3A]">Zástupce kapitána</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">Volitelné, ale doporučené pro komunikaci se spolkem.</p>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Jméno a příjmení
                  <input className={inputClass} onChange={(event) => setAssistantCaptainName(event.target.value)} value={assistantCaptainName} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Email
                  <input className={inputClass} onChange={(event) => setAssistantCaptainEmail(event.target.value)} type="email" value={assistantCaptainEmail} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Telefon
                  <input className={inputClass} onChange={(event) => setAssistantCaptainPhone(event.target.value)} value={assistantCaptainPhone} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Datum narození
                  <input className={inputClass} onChange={(event) => setAssistantCaptainDateOfBirth(event.target.value)} type="date" value={assistantCaptainDateOfBirth} />
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Adresa
                  <input className={inputClass} onChange={(event) => setAssistantCaptainAddress(event.target.value)} value={assistantCaptainAddress} />
                </label>
              </div>
            </section>
          </div>

          <label className="grid gap-2 text-sm font-black text-[#061A3A]">
            Poznámka
            <textarea className={`${inputClass} min-h-28`} onChange={(event) => setNote(event.target.value)} value={note} />
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-black text-[#061A3A]">Soupiska</h2>
              <button
                className="rounded-full bg-[#0F4FA8] px-4 py-2 text-sm font-black text-white"
                onClick={() => setRoster((current) => [...current, { ...emptyPlayer }])}
                type="button"
              >
                Přidat hráče
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {roster.map((player, index) => (
                <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4" key={index}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-[#061A3A]">Hráč {index + 1}</h3>
                    {roster.length > 1 ? (
                      <button className="text-sm font-black text-[#EF233C]" onClick={() => removeRosterPlayer(index)} type="button">
                        Odebrat
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <input className={requiredInputClass(player.first_name)} onChange={(event) => updateRoster(index, { first_name: event.target.value })} placeholder="Jméno" required value={player.first_name} />
                    <input className={requiredInputClass(player.last_name)} onChange={(event) => updateRoster(index, { last_name: event.target.value })} placeholder="Příjmení" required value={player.last_name} />
                    <input className={requiredInputClass(player.date_of_birth)} onChange={(event) => updateRoster(index, { date_of_birth: event.target.value })} placeholder="Datum narození" required type="date" value={player.date_of_birth} />
                    <input className={requiredInputClass(player.address)} onChange={(event) => updateRoster(index, { address: event.target.value })} placeholder="Adresa" required value={player.address} />
                    <input className={inputClass} onChange={(event) => updateRoster(index, { email: event.target.value })} placeholder="Email" type="email" value={player.email} />
                    <input className={inputClass} onChange={(event) => updateRoster(index, { phone: event.target.value })} placeholder="Telefon" value={player.phone} />
                    <input className={`${inputClass} md:col-span-2`} onChange={(event) => updateRoster(index, { note: event.target.value })} placeholder="Poznámka" value={player.note} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm font-bold text-slate-700">
            <input className="mt-1 size-4" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} required type="checkbox" />
            <span>
              Souhlasím s{" "}
              {competitionRulesFileUrl ? (
                <a
                  className="font-black text-[#0F4FA8] underline decoration-[#0F4FA8]/30 underline-offset-4 hover:text-[#EF233C]"
                  href={competitionRulesFileUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {competitionRulesFileName || "pravidly soutěže"}
                </a>
              ) : (
                "pravidly soutěže"
              )}{" "}
              a se zpracováním údajů pro účely registrace.
            </span>
          </label>

          <button className="w-full rounded-full bg-[#EF233C] px-6 py-4 text-base font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Odesílám..." : "Odeslat žádost"}
          </button>
        </form>
      </section>
    </PublicPageShell>
  );
}
