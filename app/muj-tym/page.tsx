"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";

type CaptainTeamPayload = {
  team?: {
    id: string;
    name: string;
    logoUrl: string | null;
    publicDescription: string;
    homeVenue: string;
    publicContactEmail: string;
    websiteUrl: string;
    seasonName: string;
  };
  requests?: RosterRequest[];
  error?: string;
};

type RosterRequest = {
  id: string;
  requested_player_name: string;
  requested_player_email: string | null;
  requested_player_note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  admin_note: string | null;
  created_at: string;
};

type TeamForm = {
  logo_url: string;
  public_description: string;
  home_venue: string;
  public_contact_email: string;
  website_url: string;
};

type RequestForm = {
  requested_player_name: string;
  requested_player_email: string;
  requested_player_note: string;
};

const emptyTeamForm: TeamForm = {
  logo_url: "",
  public_description: "",
  home_venue: "",
  public_contact_email: "",
  website_url: "",
};

const emptyRequestForm: RequestForm = {
  requested_player_name: "",
  requested_player_email: "",
  requested_player_note: "",
};

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}

function statusLabel(status: RosterRequest["status"]) {
  if (status === "pending") return "Čeká na schválení";
  if (status === "approved") return "Schváleno";
  if (status === "rejected") return "Zamítnuto";
  return "Zrušeno";
}

function statusClass(status: RosterRequest["status"]) {
  if (status === "pending") return "bg-[#F4F8FF] text-[#0B2F6B]";
  if (status === "approved") return "bg-green-100 text-green-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

export default function MyTeamPage() {
  const [team, setTeam] = useState<CaptainTeamPayload["team"] | null>(null);
  const [requests, setRequests] = useState<RosterRequest[]>([]);
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = () => {
    setIsLoading(true);
    setError(null);
    authFetch("/api/captain/team", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as CaptainTeamPayload;
        if (!response.ok) throw new Error(body.error ?? "Můj tým se nepodařilo načíst.");
        setTeam(body.team ?? null);
        setRequests(body.requests ?? []);
        setTeamForm({
          logo_url: body.team?.logoUrl ?? "",
          public_description: body.team?.publicDescription ?? "",
          home_venue: body.team?.homeVenue ?? "",
          public_contact_email: body.team?.publicContactEmail ?? "",
          website_url: body.team?.websiteUrl ?? "",
        });
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Můj tým se nepodařilo načíst."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(loadTeam, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const saveTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingTeam(true);
    setMessage(null);
    setError(null);

    const response = await authFetch("/api/captain/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamForm),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSavingTeam(false);

    if (!response.ok) {
      setError(body.error ?? "Údaje týmu se nepodařilo uložit.");
      return;
    }

    setMessage("Údaje týmu byly uloženy.");
    loadTeam();
  };

  const sendRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSendingRequest(true);
    setMessage(null);
    setError(null);

    const response = await authFetch("/api/captain/roster-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestForm),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSendingRequest(false);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo odeslat.");
      return;
    }

    setRequestForm(emptyRequestForm);
    setMessage("Žádost byla odeslána.");
    loadTeam();
  };

  return (
    <PublicPageShell activeHref="/tymy">
      <PublicHero
        description="Kapitánská správa veřejných údajů týmu a žádostí o doplnění soupisky."
        eyebrow="Kapitánská sekce"
        title="Můj tým"
      />

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {message ? <div className="mb-5 rounded-3xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{message}</div> : null}
        {error ? <div className="mb-5 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div> : null}

        {isLoading ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 text-sm font-bold text-slate-500 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            Načítám tým...
          </div>
        ) : !team ? (
          <div className="rounded-[28px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
            <p className="text-sm font-bold text-slate-600">Tato stránka je dostupná pouze přihlášenému kapitánovi týmu.</p>
            <Link className="mt-5 inline-flex rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" href="/prihlaseni">
              Přihlásit se
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-[#D8E4F2] bg-[#F4F8FF] p-2">
                  {team.logoUrl ? (
                    <Image alt={`Logo ${team.name}`} className="h-full w-full object-contain" height={80} src={team.logoUrl} unoptimized width={80} />
                  ) : (
                    <span className="text-2xl font-black text-[#0B2F6B]">{team.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">{team.seasonName}</p>
                  <h2 className="mt-1 text-3xl font-black text-[#061A3A]">{team.name}</h2>
                </div>
              </div>

              <form className="mt-6 grid gap-4" onSubmit={saveTeam}>
                <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                  Logo týmu
                  <input
                    className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setTeamForm((current) => ({ ...current, logo_url: event.target.value }))}
                    placeholder="URL adresa loga"
                    value={teamForm.logo_url}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                  Popis týmu
                  <textarea
                    className="min-h-28 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setTeamForm((current) => ({ ...current, public_description: event.target.value }))}
                    placeholder="Krátký veřejný popis týmu"
                    value={teamForm.public_description}
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                    Hrací místo
                    <input
                      className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                      onChange={(event) => setTeamForm((current) => ({ ...current, home_venue: event.target.value }))}
                      value={teamForm.home_venue}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                    Veřejný kontaktní email
                    <input
                      className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                      onChange={(event) => setTeamForm((current) => ({ ...current, public_contact_email: event.target.value }))}
                      type="email"
                      value={teamForm.public_contact_email}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                  Web nebo sociální síť
                  <input
                    className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setTeamForm((current) => ({ ...current, website_url: event.target.value }))}
                    placeholder="https://"
                    value={teamForm.website_url}
                  />
                </label>

                <button
                  className="rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:opacity-60"
                  disabled={isSavingTeam}
                  type="submit"
                >
                  {isSavingTeam ? "Ukládám..." : "Uložit údaje týmu"}
                </button>
              </form>
            </section>

            <aside className="space-y-6">
              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Žádost o přidání hráče</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">Kapitán může poslat žádost. Soupisku potvrzuje moderátor nebo administrátor.</p>
                <form className="mt-5 grid gap-4" onSubmit={sendRequest}>
                  <input
                    className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_name: event.target.value }))}
                    placeholder="Jméno hráče"
                    required
                    value={requestForm.requested_player_name}
                  />
                  <input
                    className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_email: event.target.value }))}
                    placeholder="Email hráče"
                    type="email"
                    value={requestForm.requested_player_email}
                  />
                  <textarea
                    className="min-h-24 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                    onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_note: event.target.value }))}
                    placeholder="Poznámka"
                    value={requestForm.requested_player_note}
                  />
                  <button
                    className="rounded-full bg-[#0B2F6B] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-[#061A3A] disabled:opacity-60"
                    disabled={isSendingRequest}
                    type="submit"
                  >
                    {isSendingRequest ? "Odesílám..." : "Odeslat žádost"}
                  </button>
                </form>
              </section>

              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Žádosti o přidání hráče</h2>
                {requests.length === 0 ? (
                  <p className="mt-4 text-sm font-bold text-slate-500">Zatím nejsou odeslané žádné žádosti.</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    {requests.map((request) => (
                      <div className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] p-4" key={request.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-[#061A3A]">{request.requested_player_name}</p>
                            {request.requested_player_email ? <p className="text-sm font-bold text-slate-500">{request.requested_player_email}</p> : null}
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(request.status)}`}>{statusLabel(request.status)}</span>
                        </div>
                        {request.admin_note ? <p className="mt-3 text-sm font-bold text-slate-600">Poznámka: {request.admin_note}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
