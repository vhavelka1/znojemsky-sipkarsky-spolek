"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PublicHero, PublicPageShell } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";

type CaptainTeamPayload = {
  team?: {
    id: string;
    teamSeasonId: string;
    name: string;
    logoUrl: string | null;
    publicDescription: string;
    homeVenue: string;
    publicContactEmail: string;
    websiteUrl: string;
    seasonName: string;
    registrationStatus: TeamRegistrationStatus;
    registrationSubmittedAt: string | null;
    registrationReviewedAt: string | null;
    registrationNote: string;
    registrationAdminNote: string;
    publicDetailHref: string;
    rosterHref: string;
    competitionHref: string;
  };
  competition?: TeamCompetition | null;
  roster?: RosterPlayer[];
  matches?: TeamMatch[];
  requests?: RosterRequest[];
  availablePlayers?: AvailablePlayer[];
  error?: string;
};

type TeamCompetition = {
  seasonName: string;
  leagueName: string;
  groupName: string;
  href: string;
};

type RosterPlayer = {
  id: string;
  playerId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: "player" | "captain" | "assistant_captain";
  roleLabel: string;
  statusLabel: string;
  joinedOn: string | null;
};

type TeamMatch = {
  id: string;
  scheduledAt: string;
  playedAt: string | null;
  status: "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
  statusLabel: string;
  side: string;
  opponentName: string;
  result: string | null;
};

type RosterRequest = {
  id: string;
  requested_player_id: string | null;
  requested_player_name: string;
  requested_player_email: string | null;
  requested_player_phone: string | null;
  requested_player_residence: string | null;
  requested_player_date_of_birth: string | null;
  requested_player_note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  admin_note: string | null;
  created_at: string;
};

type AvailablePlayer = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  residence: string | null;
  dateOfBirth: string | null;
};

type TeamRegistrationStatus = "draft" | "submitted" | "approved" | "returned" | "cancelled";

type TeamForm = {
  public_description: string;
  home_venue: string;
  public_contact_email: string;
  website_url: string;
};

type RequestForm = {
  request_mode: "existing" | "new";
  existing_player_id: string;
  first_name: string;
  last_name: string;
  requested_player_email: string;
  requested_player_phone: string;
  requested_player_residence: string;
  requested_player_date_of_birth: string;
  requested_player_note: string;
};

const emptyTeamForm: TeamForm = {
  public_description: "",
  home_venue: "",
  public_contact_email: "",
  website_url: "",
};

const emptyRequestForm: RequestForm = {
  request_mode: "existing",
  existing_player_id: "",
  first_name: "",
  last_name: "",
  requested_player_email: "",
  requested_player_phone: "",
  requested_player_residence: "",
  requested_player_date_of_birth: "",
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

function rosterRoleClass(role: RosterPlayer["role"]) {
  if (role === "captain") return "bg-[#EF233C] text-white";
  if (role === "assistant_captain") return "bg-[#0F4FA8] text-white";
  return "bg-[#F4F8FF] text-[#0B2F6B]";
}

function rosterStatusClass(status: string) {
  if (status === "Aktivní") return "bg-green-100 text-green-800";
  if (status === "Neaktivní hráč") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function matchStatusClass(status: TeamMatch["status"]) {
  if (status === "scheduled") return "bg-[#F4F8FF] text-[#0B2F6B]";
  if (status === "confirmed") return "bg-green-100 text-green-800";
  if (status === "awaiting_confirmation") return "bg-amber-100 text-amber-800";
  if (status === "played") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function teamRegistrationStatusLabel(status: TeamRegistrationStatus) {
  if (status === "submitted") return "Odesláno ke schválení";
  if (status === "approved") return "Schváleno";
  if (status === "returned") return "Vráceno k doplnění";
  if (status === "cancelled") return "Zrušeno";
  return "Rozpracováno";
}

function teamRegistrationStatusClass(status: TeamRegistrationStatus) {
  if (status === "approved") return "bg-green-100 text-green-800";
  if (status === "submitted") return "bg-blue-100 text-blue-800";
  if (status === "returned") return "bg-amber-100 text-amber-800";
  if (status === "cancelled") return "bg-slate-100 text-slate-700";
  return "bg-[#F4F8FF] text-[#0B2F6B]";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function MyTeamPage() {
  const [team, setTeam] = useState<CaptainTeamPayload["team"] | null>(null);
  const [competition, setCompetition] = useState<TeamCompetition | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [requests, setRequests] = useState<RosterRequest[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [registrationNote, setRegistrationNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);
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
        setCompetition(body.competition ?? null);
        setRoster(body.roster ?? []);
        setMatches(body.matches ?? []);
        setRequests(body.requests ?? []);
        setAvailablePlayers(body.availablePlayers ?? []);
        setRegistrationNote(body.team?.registrationNote ?? "");
        setTeamForm({
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

  const uploadLogo = async (logo: File | undefined) => {
    if (!logo) {
      return;
    }

    setIsUploadingLogo(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("logo", logo);

    const response = await authFetch("/api/captain/team/logo", {
      method: "POST",
      body: formData,
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setIsUploadingLogo(false);

    if (!response.ok) {
      setError(body.error ?? "Logo se nepodařilo nahrát.");
      return;
    }

    setMessage("Logo týmu bylo nahráno.");
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

  const submitSeasonRegistration = async () => {
    setIsSubmittingRegistration(true);
    setMessage(null);
    setError(null);

    const response = await authFetch("/api/captain/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_season_registration",
        registration_note: registrationNote,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSubmittingRegistration(false);

    if (!response.ok) {
      setError(body.error ?? "Účast týmu se nepodařilo odeslat.");
      return;
    }

    setMessage("Účast týmu v sezóně byla odeslána ke schválení.");
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
            <div className="space-y-6">
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

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Link className="rounded-2xl bg-[#0F4FA8] px-4 py-3 text-center text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#0B2F6B]" href={team.publicDetailHref}>
                  Veřejný profil týmu
                </Link>
                <a className="rounded-2xl bg-[#F4F8FF] px-4 py-3 text-center text-sm font-black text-[#0B2F6B] transition hover:-translate-y-0.5 hover:bg-blue-50" href="#soupiska">
                  Soupiska
                </a>
                <Link className="rounded-2xl bg-[#F4F8FF] px-4 py-3 text-center text-sm font-black text-[#0B2F6B] transition hover:-translate-y-0.5 hover:bg-blue-50" href={competition?.href ?? team.competitionHref}>
                  Aktuální soutěž
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sezóna</p>
                  <p className="mt-2 font-black text-[#061A3A]">{team.seasonName}</p>
                </div>
                <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Soutěž</p>
                  <p className="mt-2 font-black text-[#061A3A]">{competition ? `${competition.leagueName} / ${competition.groupName}` : "Není přiřazeno"}</p>
                </div>
                <div className="rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Hráči</p>
                  <p className="mt-2 font-black text-[#061A3A]">{roster.length}</p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">Účast v sezóně</p>
                    <h3 className="mt-1 text-xl font-black text-[#061A3A]">Potvrzení týmu pro {team.seasonName}</h3>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      Tým může odeslat soupisku ke schválení ještě před vytvořením lig a skupin. Zařazení do soutěže doplní administrátor později.
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${teamRegistrationStatusClass(team.registrationStatus)}`}>
                    {teamRegistrationStatusLabel(team.registrationStatus)}
                  </span>
                </div>

                {team.registrationAdminNote ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    Poznámka administrátora: {team.registrationAdminNote}
                  </div>
                ) : null}

                <label className="mt-4 flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                  Poznámka ke schválení soupisky
                  <textarea
                    className="min-h-24 rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8] disabled:bg-slate-100"
                    disabled={!["draft", "returned"].includes(team.registrationStatus)}
                    onChange={(event) => setRegistrationNote(event.target.value)}
                    placeholder="Například změny v týmu, doplnění hráčů nebo poznámka pro vedení soutěže."
                    value={registrationNote}
                  />
                </label>

                <button
                  className="mt-4 rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isSubmittingRegistration || !["draft", "returned"].includes(team.registrationStatus)}
                  onClick={submitSeasonRegistration}
                  type="button"
                >
                  {isSubmittingRegistration ? "Odesílám..." : "Odeslat soupisku ke schválení"}
                </button>
              </div>

              <form className="mt-6 grid gap-4" onSubmit={saveTeam}>
                <div>
                  <h3 className="text-xl font-black text-[#061A3A]">Základní údaje týmu</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">Tyto údaje se zobrazují veřejně u profilu týmu.</p>
                </div>
                <label className="flex flex-col gap-2 text-sm font-black text-[#061A3A]">
                  Logo týmu
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="rounded-2xl border border-dashed border-[#9DB7D7] bg-[#F4F8FF] px-4 py-4 text-sm font-bold file:mr-4 file:rounded-full file:border-0 file:bg-[#0F4FA8] file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
                    disabled={isUploadingLogo}
                    onChange={(event) => {
                      void uploadLogo(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    type="file"
                  />
                  <span className="text-xs font-bold text-slate-500">
                    {isUploadingLogo ? "Nahrávám logo..." : "PNG, JPG nebo WebP, maximálně 2 MB."}
                  </span>
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

            <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]" id="soupiska">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-[#061A3A]">Soupiska týmu</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">Aktuální hráči a jejich role v týmu.</p>
                </div>
                <Link className="rounded-full bg-[#0F4FA8] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#0B2F6B]" href={team.publicDetailHref}>
                  Veřejná soupiska
                </Link>
              </div>

              {roster.length === 0 ? (
                <p className="mt-5 text-sm font-bold text-slate-500">Soupiska zatím není dostupná.</p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-[#F4F8FF] text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Hráč</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Kontakt</th>
                        <th className="px-4 py-3">Od</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D8E4F2]">
                      {roster.map((player) => (
                        <tr key={player.id}>
                          <td className="px-4 py-4 font-black text-[#061A3A]">{player.displayName}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${rosterRoleClass(player.role)}`}>{player.roleLabel}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${rosterStatusClass(player.statusLabel)}`}>{player.statusLabel}</span>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {player.email || "-"}
                            {player.phone ? <span className="block">{player.phone}</span> : null}
                          </td>
                          <td className="px-4 py-4 text-slate-600">{formatDate(player.joinedOn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-[#061A3A]">Aktuální soutěž</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">Liga, skupina a poslední týmové zápasy.</p>
                </div>
                <Link className="rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" href={competition?.href ?? team.competitionHref}>
                  Otevřít tabulku
                </Link>
              </div>

              <div className="mt-5 rounded-3xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                {competition ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sezóna</p>
                      <p className="mt-1 font-black text-[#061A3A]">{competition.seasonName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Liga</p>
                      <p className="mt-1 font-black text-[#061A3A]">{competition.leagueName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Skupina</p>
                      <p className="mt-1 font-black text-[#061A3A]">{competition.groupName}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-slate-500">Tým zatím není přiřazený do žádné aktuální soutěže.</p>
                )}
              </div>

              {matches.length === 0 ? (
                <p className="mt-5 text-sm font-bold text-slate-500">Zápasy zatím nejsou dostupné.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {matches.slice(0, 6).map((match) => (
                    <Link className="rounded-3xl border border-[#D8E4F2] bg-white p-4 transition hover:-translate-y-0.5 hover:bg-[#F4F8FF]" href={`/admin/matches/${match.id}`} key={match.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-[#061A3A]">{match.side} vs. {match.opponentName}</p>
                          <p className="mt-1 text-sm font-bold text-slate-500">{formatDateTime(match.playedAt ?? match.scheduledAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {match.result ? <span className="rounded-full bg-[#061A3A] px-3 py-1 text-sm font-black text-white">{match.result}</span> : null}
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${matchStatusClass(match.status)}`}>{match.statusLabel}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-[32px] border border-[#D8E4F2] bg-white p-6 shadow-[0_20px_60px_rgba(6,26,58,0.08)]">
                <h2 className="text-xl font-black text-[#061A3A]">Žádost o přidání hráče</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">Vyberte hráče bez aktuálního týmu, nebo pošlete žádost na nového hráče.</p>
                <form className="mt-5 grid gap-4" onSubmit={sendRequest}>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F4F8FF] p-1">
                    <button
                      className={`rounded-xl px-3 py-2 text-sm font-black transition ${requestForm.request_mode === "existing" ? "bg-white text-[#061A3A] shadow-sm" : "text-slate-500"}`}
                      onClick={() => setRequestForm((current) => ({ ...current, request_mode: "existing" }))}
                      type="button"
                    >
                      Existující hráč
                    </button>
                    <button
                      className={`rounded-xl px-3 py-2 text-sm font-black transition ${requestForm.request_mode === "new" ? "bg-white text-[#061A3A] shadow-sm" : "text-slate-500"}`}
                      onClick={() => setRequestForm((current) => ({ ...current, request_mode: "new" }))}
                      type="button"
                    >
                      Nový hráč
                    </button>
                  </div>

                  {requestForm.request_mode === "existing" ? (
                    <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                      Hráč bez aktuálního týmu
                      <select
                        className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                        onChange={(event) => setRequestForm((current) => ({ ...current, existing_player_id: event.target.value }))}
                        required
                        value={requestForm.existing_player_id}
                      >
                        <option value="">Vyberte hráče</option>
                        {availablePlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.displayName}{player.email ? ` / ${player.email}` : ""}
                          </option>
                        ))}
                      </select>
                      {availablePlayers.length === 0 ? (
                        <span className="text-xs font-bold text-slate-500">Momentálně nejsou dostupní žádní hráči bez týmu v aktuální sezóně.</span>
                      ) : null}
                    </label>
                  ) : (
                    <div className="grid gap-4">
                      <div className="grid gap-3">
                        <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                          Jméno
                          <input
                            className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                            onChange={(event) => setRequestForm((current) => ({ ...current, first_name: event.target.value }))}
                            required
                            value={requestForm.first_name}
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                          Příjmení
                          <input
                            className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                            onChange={(event) => setRequestForm((current) => ({ ...current, last_name: event.target.value }))}
                            required
                            value={requestForm.last_name}
                          />
                        </label>
                      </div>
                      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                        Email hráče
                        <input
                          className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                          onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_email: event.target.value }))}
                          required
                          type="email"
                          value={requestForm.requested_player_email}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                        Telefon
                        <input
                          className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                          onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_phone: event.target.value }))}
                          value={requestForm.requested_player_phone}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                        Bydliště
                        <input
                          className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                          onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_residence: event.target.value }))}
                          required
                          value={requestForm.requested_player_residence}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                        Datum narození
                        <input
                          className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]"
                          onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_date_of_birth: event.target.value }))}
                          required
                          type="date"
                          value={requestForm.requested_player_date_of_birth}
                        />
                      </label>
                    </div>
                  )}

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
                            {request.requested_player_residence || request.requested_player_date_of_birth ? (
                              <p className="text-xs font-bold text-slate-500">
                                {request.requested_player_residence || "Bez bydliště"} / {formatDate(request.requested_player_date_of_birth)}
                              </p>
                            ) : null}
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
