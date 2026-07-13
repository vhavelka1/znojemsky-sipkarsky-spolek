"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicPageShell } from "@/components/public/PublicShell";
import { supabase } from "@/lib/supabase";

export type MyTeamSectionKey = "overview" | "roster" | "requests" | "profile" | "competition";

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
  competitionRulesFileName?: string;
  competitionRulesFileUrl?: string;
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
  leftOn: string | null;
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
  currentTeamName: string | null;
  isCurrentTeamPlayer: boolean;
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

const captainTabs: Array<{ key: MyTeamSectionKey; href: string; label: string }> = [
  { key: "overview", href: "/muj-tym", label: "Přehled" },
  { key: "roster", href: "/muj-tym/soupiska", label: "Soupiska" },
  { key: "requests", href: "/muj-tym/zadosti", label: "Žádosti" },
  { key: "profile", href: "/muj-tym/profil", label: "Profil týmu" },
  { key: "competition", href: "/muj-tym/soutez", label: "Soutěž" },
];

const inputClass =
  "rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none transition focus:border-[#0F4FA8]";

function requiredInputClass(value: string) {
  return value.trim() ? inputClass : `${inputClass} border-[#EF233C] bg-red-50 focus:border-[#EF233C]`;
}

function RequiredMark() {
  return <span className="ml-2 text-xs font-black uppercase tracking-[0.08em] text-[#EF233C]">povinné</span>;
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}

function requestStatusLabel(status: RosterRequest["status"]) {
  if (status === "pending") return "Čeká na schválení";
  if (status === "approved") return "Schváleno";
  if (status === "rejected") return "Zamítnuto";
  return "Zrušeno";
}

function requestStatusClass(status: RosterRequest["status"]) {
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

function rosterStatusClass(player: RosterPlayer) {
  if (player.leftOn) return "bg-slate-100 text-slate-700";
  if (player.statusLabel === "Aktivní") return "bg-green-100 text-green-800";
  return "bg-amber-100 text-amber-800";
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .trim();
}

function parseRegistrationNote(note: string) {
  const majorLinePattern = /(?:^|\n)\s*Zájem pořádat Major turnaj:\s*(ano|ne)\s*$/i;
  const match = note.match(majorLinePattern);

  return {
    note: note.replace(majorLinePattern, "").trim(),
    wantsMajorTournament: match?.[1]?.toLocaleLowerCase("cs-CZ") === "ano",
  };
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-[#D8E4F2] bg-white shadow-[0_20px_60px_rgba(6,26,58,0.08)] ${className}`}>
      {children}
    </section>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>{children}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold text-slate-500">{children}</p>;
}

function TeamShellHeader({
  team,
  section,
  activeCount,
  pendingCount,
}: {
  team: NonNullable<CaptainTeamPayload["team"]>;
  section: MyTeamSectionKey;
  activeCount: number;
  pendingCount: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] p-2">
            {team.logoUrl ? (
              <Image alt={`Logo ${team.name}`} className="h-full w-full object-contain" height={72} src={team.logoUrl} unoptimized width={72} />
            ) : (
              <span className="text-2xl font-black text-[#0B2F6B]">{team.name.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">Můj tým</p>
            <h1 className="truncate text-2xl font-black text-[#061A3A] sm:text-3xl">{team.name}</h1>
            <p className="text-sm font-bold text-slate-500">{team.seasonName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={teamRegistrationStatusClass(team.registrationStatus)}>
            {teamRegistrationStatusLabel(team.registrationStatus)}
          </Badge>
          <Badge className="bg-[#F4F8FF] text-[#0B2F6B]">{activeCount} aktivních hráčů</Badge>
          {pendingCount > 0 ? <Badge className="bg-red-100 text-red-800">{pendingCount} čeká</Badge> : null}
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-t border-[#D8E4F2] px-4 py-3 sm:px-5">
        {captainTabs.map((tab) => (
          <Link
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition ${
              tab.key === section ? "bg-[#0B2F6B] text-white shadow-lg shadow-blue-950/20" : "bg-[#F4F8FF] text-[#0B2F6B] hover:bg-blue-50"
            }`}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </Card>
  );
}

function SummaryCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-3xl border border-[#D8E4F2] bg-white p-4 shadow-[0_12px_36px_rgba(6,26,58,0.06)]">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-[#061A3A]">{value}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export function MyTeamSection({ section }: { section: MyTeamSectionKey }) {
  const [team, setTeam] = useState<CaptainTeamPayload["team"] | null>(null);
  const [competition, setCompetition] = useState<TeamCompetition | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [requests, setRequests] = useState<RosterRequest[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [existingPlayerSearch, setExistingPlayerSearch] = useState("");
  const [debouncedExistingPlayerSearch, setDebouncedExistingPlayerSearch] = useState("");
  const [showInactiveRoster, setShowInactiveRoster] = useState(false);
  const [registrationNote, setRegistrationNote] = useState("");
  const [wantsMajorTournament, setWantsMajorTournament] = useState(false);
  const [registrationRulesAccepted, setRegistrationRulesAccepted] = useState(false);
  const [competitionRulesFileName, setCompetitionRulesFileName] = useState("");
  const [competitionRulesFileUrl, setCompetitionRulesFileUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
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
        const parsedRegistrationNote = parseRegistrationNote(body.team?.registrationNote ?? "");
        setRegistrationNote(parsedRegistrationNote.note);
        setWantsMajorTournament(parsedRegistrationNote.wantsMajorTournament);
        setRegistrationRulesAccepted(false);
        setCompetitionRulesFileName(body.competitionRulesFileName ?? "");
        setCompetitionRulesFileUrl(body.competitionRulesFileUrl ?? "");
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedExistingPlayerSearch(existingPlayerSearch), 250);
    return () => window.clearTimeout(timeoutId);
  }, [existingPlayerSearch]);

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
    if (!logo) return;
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
    setExistingPlayerSearch("");
    setMessage("Žádost byla odeslána.");
    loadTeam();
  };

  const submitSeasonRegistration = async () => {
    if (!registrationRulesAccepted) {
      setMessage(null);
      setError("Pro odeslání soupisky je potřeba souhlas s pravidly soutěže.");
      return;
    }

    setIsSubmittingRegistration(true);
    setMessage(null);
    setError(null);

    const response = await authFetch("/api/captain/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_season_registration",
        registration_note: registrationNote,
        wants_major_tournament: wantsMajorTournament,
        rules_accepted: registrationRulesAccepted,
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

  const removeRosterMember = async (player: RosterPlayer) => {
    if (!window.confirm(`Opravdu chcete vyřadit hráče ${player.displayName} ze soupisky?`)) return;

    setRemovingMembershipId(player.id);
    setMessage(null);
    setError(null);

    const response = await authFetch("/api/captain/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove_roster_member",
        membership_id: player.id,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setRemovingMembershipId(null);

    if (!response.ok) {
      setError(body.error ?? "Hráče se nepodařilo vyřadit ze soupisky.");
      return;
    }

    setMessage("Hráč byl vyřazen ze soupisky.");
    loadTeam();
  };

  const canEditRoster = team ? ["draft", "returned"].includes(team.registrationStatus) : false;
  const activeRoster = roster.filter((player) => !player.leftOn);
  const inactiveRoster = roster.filter((player) => player.leftOn);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const selectedExistingPlayer = availablePlayers.find((player) => player.id === requestForm.existing_player_id) ?? null;

  const filteredAvailablePlayers = useMemo(() => {
    const normalizedSearch = normalizeSearch(debouncedExistingPlayerSearch);
    if (normalizedSearch.length < 2) return [];

    return [...availablePlayers]
      .filter((player) =>
        [
          player.displayName,
          player.firstName ?? "",
          player.lastName ?? "",
          player.email ?? "",
          player.residence ?? "",
          player.currentTeamName ?? "",
        ].some((value) => normalizeSearch(value).includes(normalizedSearch)),
      )
      .sort((first, second) => {
        const firstHasTeam = first.currentTeamName ? 0 : 1;
        const secondHasTeam = second.currentTeamName ? 0 : 1;
        return firstHasTeam - secondHasTeam || first.displayName.localeCompare(second.displayName, "cs");
      })
      .slice(0, 20);
  }, [availablePlayers, debouncedExistingPlayerSearch]);

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === "scheduled")
        .sort((first, second) => new Date(first.scheduledAt).getTime() - new Date(second.scheduledAt).getTime()),
    [matches],
  );
  const recentMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status !== "scheduled")
        .sort((first, second) => new Date(second.playedAt ?? second.scheduledAt).getTime() - new Date(first.playedAt ?? first.scheduledAt).getTime()),
    [matches],
  );

  const renderRosterTable = (players: RosterPlayer[]) => {
    if (players.length === 0) return <EmptyState>V této části nejsou žádní hráči.</EmptyState>;

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#F4F8FF] text-xs font-black text-slate-500">
            <tr>
              <th className="px-4 py-3">Hráč</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Člen od</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D8E4F2]">
            {players.map((player) => (
              <tr className="h-14" key={player.id}>
                <td className="px-4 py-2 font-black text-[#061A3A]">{player.displayName}</td>
                <td className="px-4 py-2">
                  <Badge className={rosterRoleClass(player.role)}>{player.roleLabel}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge className={rosterStatusClass(player)}>{player.leftOn ? "Neaktivní" : player.statusLabel}</Badge>
                </td>
                <td className="px-4 py-2 text-xs font-bold text-slate-600">
                  {player.email || "-"}
                  {player.phone ? <span className="block">{player.phone}</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDate(player.joinedOn)}</td>
                <td className="px-4 py-2">
                  {player.leftOn ? (
                    <span className="text-xs font-bold text-slate-500">Vyřazen {formatDate(player.leftOn)}</span>
                  ) : canEditRoster && player.role !== "captain" ? (
                    <button
                      className="rounded-full border border-red-200 px-3 py-2 text-xs font-black text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={removingMembershipId === player.id}
                      onClick={() => void removeRosterMember(player)}
                      type="button"
                    >
                      {removingMembershipId === player.id ? "Vyřazuji..." : "Vyřadit"}
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMatchList = (items: TeamMatch[], emptyText: string) => {
    if (items.length === 0) return <EmptyState>{emptyText}</EmptyState>;

    return (
      <div className="grid gap-2">
        {items.slice(0, 6).map((match) => (
          <Link className="rounded-2xl border border-[#D8E4F2] bg-white p-3 transition hover:-translate-y-0.5 hover:bg-[#F4F8FF]" href={`/admin/matches/${match.id}`} key={match.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-black text-[#061A3A]">{match.side} vs. {match.opponentName}</p>
                <p className="text-xs font-bold text-slate-500">{formatDateTime(match.playedAt ?? match.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {match.result ? <span className="rounded-full bg-[#061A3A] px-3 py-1 text-sm font-black text-white">{match.result}</span> : null}
                <Badge className={matchStatusClass(match.status)}>{match.statusLabel}</Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  };

  const renderRequestsGroup = (title: string, items: RosterRequest[]) => (
    <div className="space-y-2">
      <h3 className="text-sm font-black uppercase tracking-[0.12em] text-[#EF233C]">{title}</h3>
      {items.length === 0 ? (
        <EmptyState>Žádné žádosti.</EmptyState>
      ) : (
        <div className="grid gap-2">
          {items.map((request) => (
            <div className="rounded-2xl border border-[#D8E4F2] bg-white px-4 py-3" key={request.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-black text-[#061A3A]">{request.requested_player_name}</p>
                  <p className="text-xs font-bold text-slate-500">
                    {request.requested_player_id ? "Existující hráč" : "Nový hráč"} / {formatDate(request.created_at)}
                  </p>
                </div>
                <Badge className={requestStatusClass(request.status)}>{requestStatusLabel(request.status)}</Badge>
              </div>
              {request.admin_note ? <p className="mt-2 text-xs font-bold text-slate-600">Poznámka: {request.admin_note}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  let content: React.ReactNode = null;

  if (team) {
    if (section === "overview") {
      content = (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Stav registrace" value={teamRegistrationStatusLabel(team.registrationStatus)} href="/muj-tym/soupiska" />
            <SummaryCard label="Aktivní hráči" value={String(activeRoster.length)} href="/muj-tym/soupiska" />
            <SummaryCard label="Čekající žádosti" value={String(pendingRequests.length)} href="/muj-tym/zadosti" />
            <SummaryCard label="Aktuální soutěž" value={competition ? `${competition.leagueName} / ${competition.groupName}` : "Nepřiřazeno"} href="/muj-tym/soutez" />
            <SummaryCard label="Nejbližší zápas" value={upcomingMatches[0] ? upcomingMatches[0].opponentName : "Nenaplánován"} href="/muj-tym/soutez" />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#EF233C]">Účast v sezóně</p>
                <h2 className="mt-1 text-2xl font-black text-[#061A3A]">{team.seasonName}</h2>
                <p className="mt-2 max-w-3xl text-sm font-bold text-slate-600">
                  Soupisku a potvrzení účasti spravujte v části Soupiska. Liga a skupina se doplní po zařazení týmu do soutěže.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Badge className={teamRegistrationStatusClass(team.registrationStatus)}>{teamRegistrationStatusLabel(team.registrationStatus)}</Badge>
                <Link className="rounded-full bg-[#EF233C] px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" href="/muj-tym/soupiska">
                  Otevřít soupisku
                </Link>
              </div>
            </div>
            {team.registrationAdminNote ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Poznámka administrátora: {team.registrationAdminNote}
              </div>
            ) : null}
          </Card>
        </div>
      );
    }

    if (section === "roster") {
      content = (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8E4F2] p-5">
              <div>
                <h2 className="text-2xl font-black text-[#061A3A]">Soupiska</h2>
                <p className="text-sm font-bold text-slate-500">Aktuální hráči a role v týmu.</p>
              </div>
              <Link className="rounded-full bg-[#0F4FA8] px-4 py-2 text-sm font-black text-white" href={team.publicDetailHref}>
                Veřejná soupiska
              </Link>
            </div>
            <div className="p-3 sm:p-4">
              {renderRosterTable(activeRoster)}
              {inactiveRoster.length > 0 ? (
                <div className="mt-4">
                  <button
                    className="rounded-full bg-[#F4F8FF] px-4 py-2 text-sm font-black text-[#0B2F6B]"
                    onClick={() => setShowInactiveRoster((current) => !current)}
                    type="button"
                  >
                    Neaktivní hráči ({inactiveRoster.length})
                  </button>
                  {showInactiveRoster ? <div className="mt-3">{renderRosterTable(inactiveRoster)}</div> : null}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-black text-[#061A3A]">Odeslání ke schválení</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Soupisku lze měnit jen ve stavu rozpracováno nebo vráceno k doplnění.</p>
            <label className="mt-4 grid gap-2 text-sm font-black text-[#061A3A]">
              Poznámka
              <textarea
                className="min-h-24 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8] disabled:bg-slate-100"
                disabled={!canEditRoster}
                onChange={(event) => setRegistrationNote(event.target.value)}
                value={registrationNote}
              />
            </label>
            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-black text-[#061A3A]">
              <input checked={wantsMajorTournament} className="mt-1 size-4" disabled={!canEditRoster} onChange={(event) => setWantsMajorTournament(event.target.checked)} type="checkbox" />
              <span>Tým má zájem pořádat Major turnaj</span>
            </label>
            <label className="mt-3 flex items-start gap-3 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold text-slate-700">
              <input checked={registrationRulesAccepted} className="mt-1 size-4" disabled={!canEditRoster} onChange={(event) => setRegistrationRulesAccepted(event.target.checked)} type="checkbox" />
              <span>
                Souhlasím s{" "}
                {competitionRulesFileUrl ? (
                  <a className="font-black text-[#0F4FA8] underline decoration-[#0F4FA8]/30 underline-offset-4 hover:text-[#EF233C]" href={competitionRulesFileUrl} rel="noreferrer" target="_blank">
                    {competitionRulesFileName || "pravidly soutěže"}
                  </a>
                ) : (
                  "pravidly soutěže"
                )}{" "}
                a potvrzuji správnost soupisky.
              </span>
            </label>
            <button
              className="mt-4 w-full rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmittingRegistration || !registrationRulesAccepted || !canEditRoster}
              onClick={submitSeasonRegistration}
              type="button"
            >
              {isSubmittingRegistration ? "Odesílám..." : "Odeslat soupisku ke schválení"}
            </button>
          </Card>
        </div>
      );
    }

    if (section === "requests") {
      content = (
        <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
          <Card className="p-5">
            <h2 className="text-2xl font-black text-[#061A3A]">Žádost o přidání hráče</h2>
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
                  Existující hráč
                  <input
                    className={inputClass}
                    onChange={(event) => {
                      setExistingPlayerSearch(event.target.value);
                      setRequestForm((current) => ({ ...current, existing_player_id: "" }));
                    }}
                    placeholder="Napište alespoň 2 znaky"
                    required
                    value={selectedExistingPlayer ? selectedExistingPlayer.displayName : existingPlayerSearch}
                  />
                  {requestForm.existing_player_id ? (
                    <span className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-800">
                      Vybráno: {selectedExistingPlayer?.displayName}
                    </span>
                  ) : debouncedExistingPlayerSearch.trim().length < 2 ? (
                    <span className="text-xs font-bold text-slate-500">Výsledky se zobrazí po zadání alespoň 2 znaků.</span>
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#D8E4F2] bg-white p-2 shadow-[0_14px_36px_rgba(6,26,58,0.10)]">
                      {filteredAvailablePlayers.length === 0 ? (
                        <p className="px-3 py-2 text-xs font-bold text-slate-500">Nebyl nalezen žádný hráč.</p>
                      ) : (
                        filteredAvailablePlayers.map((player) => (
                          <button
                            className="w-full rounded-xl px-3 py-2 text-left text-sm font-black text-[#061A3A] transition hover:bg-[#F4F8FF]"
                            key={player.id}
                            onClick={() => {
                              setRequestForm((current) => ({ ...current, existing_player_id: player.id }));
                              setExistingPlayerSearch(player.displayName);
                            }}
                            type="button"
                          >
                            {player.displayName}
                            <span className={`block text-xs font-bold ${player.currentTeamName ? "text-[#0F4FA8]" : "text-green-700"}`}>
                              {player.currentTeamName ? `Aktuální soupiska: ${player.currentTeamName}` : "Bez aktuálního týmu"}
                            </span>
                            {player.email ? <span className="block text-xs font-bold text-slate-500">{player.email}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </label>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-2 text-sm font-black text-[#061A3A]">
                      <span>Jméno<RequiredMark /></span>
                      <input className={requiredInputClass(requestForm.first_name)} onChange={(event) => setRequestForm((current) => ({ ...current, first_name: event.target.value }))} required value={requestForm.first_name} />
                    </label>
                    <label className="grid min-w-0 gap-2 text-sm font-black text-[#061A3A]">
                      <span>Příjmení<RequiredMark /></span>
                      <input className={requiredInputClass(requestForm.last_name)} onChange={(event) => setRequestForm((current) => ({ ...current, last_name: event.target.value }))} required value={requestForm.last_name} />
                    </label>
                  </div>
                  <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                    Email hráče
                    <input className={inputClass} onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_email: event.target.value }))} type="email" value={requestForm.requested_player_email} />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                    Telefon
                    <input className={inputClass} onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_phone: event.target.value }))} value={requestForm.requested_player_phone} />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                    <span>Bydliště<RequiredMark /></span>
                    <input className={requiredInputClass(requestForm.requested_player_residence)} onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_residence: event.target.value }))} required value={requestForm.requested_player_residence} />
                  </label>
                  <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                    <span>Datum narození<RequiredMark /></span>
                    <input className={requiredInputClass(requestForm.requested_player_date_of_birth)} onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_date_of_birth: event.target.value }))} required type="date" value={requestForm.requested_player_date_of_birth} />
                  </label>
                </div>
              )}

              <textarea className={`${inputClass} min-h-24`} onChange={(event) => setRequestForm((current) => ({ ...current, requested_player_note: event.target.value }))} placeholder="Poznámka" value={requestForm.requested_player_note} />
              <button className="rounded-full bg-[#0B2F6B] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-[#061A3A] disabled:opacity-60" disabled={isSendingRequest} type="submit">
                {isSendingRequest ? "Odesílám..." : "Odeslat žádost"}
              </button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-2xl font-black text-[#061A3A]">Odeslané žádosti</h2>
            <div className="mt-5 grid gap-5">
              {renderRequestsGroup("Čekající", requests.filter((request) => request.status === "pending"))}
              {renderRequestsGroup("Schválené", requests.filter((request) => request.status === "approved"))}
              {renderRequestsGroup("Zamítnuté", requests.filter((request) => request.status === "rejected"))}
            </div>
          </Card>
        </div>
      );
    }

    if (section === "profile") {
      content = (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-[#061A3A]">Profil týmu</h2>
              <p className="text-sm font-bold text-slate-500">Veřejné údaje, které se zobrazují u týmu.</p>
            </div>
            <Link className="rounded-full bg-[#0F4FA8] px-4 py-2 text-sm font-black text-white" href={team.publicDetailHref}>
              Zobrazit veřejný profil
            </Link>
          </div>

          <form className="mt-5 grid max-w-3xl gap-4" onSubmit={saveTeam}>
            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
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
              <span className="text-xs font-bold text-slate-500">{isUploadingLogo ? "Nahrávám logo..." : "PNG, JPG nebo WebP, maximálně 2 MB."}</span>
            </label>

            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Veřejný popis týmu
              <textarea className="min-h-28 rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] px-4 py-3 text-sm font-bold outline-none focus:border-[#0F4FA8]" onChange={(event) => setTeamForm((current) => ({ ...current, public_description: event.target.value }))} value={teamForm.public_description} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Hrací místo
                <input className={inputClass} onChange={(event) => setTeamForm((current) => ({ ...current, home_venue: event.target.value }))} value={teamForm.home_venue} />
              </label>
              <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                Veřejný kontaktní email
                <input className={inputClass} onChange={(event) => setTeamForm((current) => ({ ...current, public_contact_email: event.target.value }))} type="email" value={teamForm.public_contact_email} />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-black text-[#061A3A]">
              Web nebo sociální síť
              <input className={inputClass} onChange={(event) => setTeamForm((current) => ({ ...current, website_url: event.target.value }))} placeholder="https://" value={teamForm.website_url} />
            </label>

            <button className="w-fit rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:opacity-60" disabled={isSavingTeam} type="submit">
              {isSavingTeam ? "Ukládám..." : "Uložit změny"}
            </button>
          </form>
        </Card>
      );
    }

    if (section === "competition") {
      content = (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Card className="p-5">
            <h2 className="text-2xl font-black text-[#061A3A]">Soutěž</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Sezóna</p>
                <p className="mt-1 font-black text-[#061A3A]">{team.seasonName}</p>
              </div>
              {competition ? (
                <>
                  <div className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Liga</p>
                    <p className="mt-1 font-black text-[#061A3A]">{competition.leagueName}</p>
                  </div>
                  <div className="rounded-2xl border border-[#D8E4F2] bg-[#F4F8FF] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Skupina</p>
                    <p className="mt-1 font-black text-[#061A3A]">{competition.groupName}</p>
                  </div>
                </>
              ) : (
                <EmptyState>Tým zatím není přiřazený do žádné aktuální soutěže.</EmptyState>
              )}
              <Badge className={teamRegistrationStatusClass(team.registrationStatus)}>{teamRegistrationStatusLabel(team.registrationStatus)}</Badge>
              <Link className="mt-2 rounded-full bg-[#EF233C] px-4 py-3 text-center text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-red-500" href={competition?.href ?? team.competitionHref}>
                Otevřít tabulku
              </Link>
            </div>
          </Card>

          <div className="grid gap-5">
            <Card className="p-5">
              <h2 className="text-xl font-black text-[#061A3A]">Nejbližší zápasy</h2>
              <div className="mt-4">{renderMatchList(upcomingMatches, "Nejsou naplánované žádné zápasy.")}</div>
            </Card>
            <Card className="p-5">
              <h2 className="text-xl font-black text-[#061A3A]">Poslední zápasy</h2>
              <div className="mt-4">{renderMatchList(recentMatches, "Zatím nejsou odehrané žádné zápasy.")}</div>
            </Card>
          </div>
        </div>
      );
    }
  }

  return (
    <PublicPageShell activeHref="/tymy">
      <section className="bg-[#061A3A] text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#EF233C]">Kapitánská sekce</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Můj tým</h1>
          <p className="mt-2 max-w-3xl text-base font-bold text-blue-100">Správa soupisky, žádostí, profilu týmu a soutěžních informací.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {message ? <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-800">{message}</div> : null}
        {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-700">{error}</div> : null}

        {isLoading ? (
          <Card className="p-5 text-sm font-bold text-slate-500">Načítám tým...</Card>
        ) : !team ? (
          <Card className="p-5">
            <p className="text-sm font-bold text-slate-600">Tato stránka je dostupná pouze přihlášenému kapitánovi nebo zástupci kapitána týmu.</p>
            <Link className="mt-4 inline-flex rounded-full bg-[#EF233C] px-5 py-3 text-sm font-black text-white" href="/prihlaseni">
              Přihlásit se
            </Link>
          </Card>
        ) : (
          <div className="space-y-5">
            <TeamShellHeader activeCount={activeRoster.length} pendingCount={pendingRequests.length} section={section} team={team} />
            {content}
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
