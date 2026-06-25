"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";

type League = { id: string; season_id: string; name: string };
type Group = { id: string; league_id: string; name: string };
type MetaPayload = {
  activeSeasonId?: string | null;
  leagues?: League[];
  groups?: Group[];
  error?: string;
};
type RosterPlayer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  note: string;
};

const emptyPlayer: RosterPlayer = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  note: "",
};

const inputClass =
  "min-h-12 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold text-[#061A3A] outline-none transition focus:border-[#3B82F6]";

export default function TeamRegistrationPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [groupId, setGroupId] = useState("");
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
        setLeagues(body.leagues ?? []);
        setGroups(body.groups ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Data pro registraci se nepodařilo načíst."));
  }, []);

  const visibleGroups = useMemo(
    () => groups.filter((group) => !leagueId || group.league_id === leagueId),
    [groups, leagueId],
  );

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
        preferred_league_id: leagueId || null,
        preferred_group_id: groupId || null,
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
    setLeagueId("");
    setGroupId("");
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

          <input className="hidden" onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} value={website} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Název týmu
              <input className={inputClass} onChange={(event) => setTeamName(event.target.value)} required value={teamName} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Jméno kapitána
              <input className={inputClass} onChange={(event) => setCaptainName(event.target.value)} required value={captainName} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Email kapitána
              <input className={inputClass} onChange={(event) => setCaptainEmail(event.target.value)} required type="email" value={captainEmail} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Telefon kapitána
              <input className={inputClass} onChange={(event) => setCaptainPhone(event.target.value)} value={captainPhone} />
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Preferovaná liga
              <select className={inputClass} onChange={(event) => { setLeagueId(event.target.value); setGroupId(""); }} value={leagueId}>
                <option value="">Bez preference</option>
                {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Preferovaná skupina
              <select className={inputClass} onChange={(event) => setGroupId(event.target.value)} value={groupId}>
                <option value="">Bez preference</option>
                {visibleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
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
                    <input className={inputClass} onChange={(event) => updateRoster(index, { first_name: event.target.value })} placeholder="Jméno" required value={player.first_name} />
                    <input className={inputClass} onChange={(event) => updateRoster(index, { last_name: event.target.value })} placeholder="Příjmení" required value={player.last_name} />
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
