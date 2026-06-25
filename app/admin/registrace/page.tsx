"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/admin";
import { adminFetch } from "@/lib/adminFetch";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type PlayerStatus = "active" | "needs_registration" | "new" | "duplicate" | "pending";

type PlayerOption = {
  id: string;
  display_name: string;
  email: string | null;
};

type TeamOption = {
  id: string;
  name: string;
};

type TeamRosterPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  note: string | null;
  matched_player_id: string | null;
  player_status: PlayerStatus;
};

type TeamRequest = {
  id: string;
  team_name: string;
  captain_name: string;
  captain_email: string;
  captain_phone: string | null;
  captain_address: string | null;
  captain_date_of_birth: string | null;
  assistant_captain_name: string | null;
  assistant_captain_email: string | null;
  assistant_captain_phone: string | null;
  assistant_captain_address: string | null;
  assistant_captain_date_of_birth: string | null;
  wants_major_tournament: boolean;
  note: string | null;
  status: RequestStatus;
  admin_note: string | null;
  created_at: string;
  roster: TeamRosterPlayer[];
  rosterCount: number;
};

type PlayerRequest = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_team_name: string | null;
  preferred_team_id: string | null;
  looking_for_team: boolean;
  note: string | null;
  status: RequestStatus;
  admin_note: string | null;
  matched_player_id: string | null;
  player_status: PlayerStatus;
  created_at: string;
};

type Payload = {
  teamRequests?: TeamRequest[];
  playerRequests?: PlayerRequest[];
  players?: PlayerOption[];
  teams?: TeamOption[];
  error?: string;
};

const statusLabels: Record<RequestStatus, string> = {
  pending: "Čeká na schválení",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  cancelled: "Zrušeno",
};

const playerStatusLabels: Record<PlayerStatus, string> = {
  active: "Aktivní hráč",
  needs_registration: "Nutná registrace",
  new: "Nový hráč",
  duplicate: "Možná duplicita",
  pending: "Čeká na kontrolu",
};

function statusClass(status: RequestStatus) {
  if (status === "approved") return "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800";
  if (status === "rejected") return "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-800";
  if (status === "cancelled") return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
  return "admin-badge";
}

function playerStatusClass(status: PlayerStatus) {
  if (status === "active") return "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-800";
  if (status === "duplicate") return "rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800";
  if (status === "needs_registration") return "rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800";
  return "rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatPlainDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(value));
}

function playerName(player: Pick<TeamRosterPlayer | PlayerRequest, "first_name" | "last_name">) {
  return `${player.first_name} ${player.last_name}`.trim();
}

export default function AdminRegistrationsPage() {
  const [activeTab, setActiveTab] = useState<"teams" | "players">("teams");
  const [teamRequests, setTeamRequests] = useState<TeamRequest[]>([]);
  const [playerRequests, setPlayerRequests] = useState<PlayerRequest[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rosterMatches, setRosterMatches] = useState<Record<string, Record<string, string>>>({});
  const [playerMatches, setPlayerMatches] = useState<Record<string, string>>({});
  const [preferredTeams, setPreferredTeams] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTeamRequest = useMemo(
    () => teamRequests.find((request) => request.id === selectedTeamId) ?? teamRequests[0] ?? null,
    [selectedTeamId, teamRequests],
  );
  const selectedPlayerRequest = useMemo(
    () => playerRequests.find((request) => request.id === selectedPlayerId) ?? playerRequests[0] ?? null,
    [selectedPlayerId, playerRequests],
  );

  function loadRegistrations() {
    setIsLoading(true);
    setError(null);
    adminFetch("/api/admin/registrace", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Payload;
        if (!response.ok) throw new Error(body.error ?? "Žádosti se nepodařilo načíst.");
        setTeamRequests(body.teamRequests ?? []);
        setPlayerRequests(body.playerRequests ?? []);
        setPlayers(body.players ?? []);
        setTeams(body.teams ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Žádosti se nepodařilo načíst."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadRegistrations, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function review(kind: "team" | "player", id: string, action: "approve" | "reject") {
    setProcessingId(id);
    setMessage(null);
    setError(null);

    const response = await adminFetch("/api/admin/registrace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        id,
        action,
        admin_note: notes[id] ?? "",
        roster_matches: rosterMatches[id] ?? {},
        matched_player_id: playerMatches[id] ?? null,
        preferred_team_id: preferredTeams[id] ?? null,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo zpracovat.");
      return;
    }

    setMessage(body.message ?? (action === "approve" ? "Žádost byla schválena." : "Žádost byla zamítnuta."));
    loadRegistrations();
  }

  async function deleteRequest(kind: "team" | "player", id: string) {
    if (!window.confirm("Opravdu chcete žádost odstranit?")) return;

    setProcessingId(id);
    setMessage(null);
    setError(null);

    const response = await adminFetch(`/api/admin/registrace?kind=${kind}&id=${id}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setProcessingId(null);

    if (!response.ok) {
      setError(body.error ?? "Žádost se nepodařilo odstranit.");
      return;
    }

    setMessage(body.message ?? "Žádost byla odstraněna.");
    if (kind === "team" && selectedTeamId === id) setSelectedTeamId(null);
    if (kind === "player" && selectedPlayerId === id) setSelectedPlayerId(null);
    loadRegistrations();
  }

  async function exportCsv() {
    setError(null);
    const response = await adminFetch("/api/admin/registrace?export=csv");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Export se nepodařilo připravit.");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "registrace.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader
          description="Schvalování týmových přihlášek a registrací jednotlivých hráčů."
          title="Registrace"
        />
        <button
          className="w-fit rounded-xl bg-[#EF233C] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
          onClick={exportCsv}
          type="button"
        >
          Export do Excelu
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-full px-5 py-3 text-sm font-black ${activeTab === "teams" ? "bg-[#061A3A] text-white" : "bg-white text-[#061A3A]"}`} onClick={() => setActiveTab("teams")} type="button">
          Žádosti týmů
        </button>
        <button className={`rounded-full px-5 py-3 text-sm font-black ${activeTab === "players" ? "bg-[#061A3A] text-white" : "bg-white text-[#061A3A]"}`} onClick={() => setActiveTab("players")} type="button">
          Žádosti jednotlivců
        </button>
      </div>

      {message ? <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {activeTab === "teams" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <Card className="p-0">
            <div className="border-b border-[var(--admin-border)] px-5 py-4">
              <h2 className="text-lg font-black text-[#061A3A]">Žádosti týmů</h2>
            </div>
            {isLoading ? (
              <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Načítám žádosti...</p>
            ) : teamRequests.length === 0 ? (
              <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Žádosti zatím nejsou k dispozici.</p>
            ) : (
              <div className="divide-y divide-[var(--admin-border)]">
                {teamRequests.map((request) => (
                  <button
                    className={`block w-full px-5 py-4 text-left transition hover:bg-[#F4F8FF] ${selectedTeamRequest?.id === request.id ? "bg-[#F4F8FF]" : "bg-white"}`}
                    key={request.id}
                    onClick={() => setSelectedTeamId(request.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[#061A3A]">{request.team_name}</h3>
                      <span className={statusClass(request.status)}>{statusLabels[request.status]}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-600">{request.captain_name} / {request.captain_email}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{request.rosterCount} hráčů / {formatDate(request.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {selectedTeamRequest ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-[#061A3A]">{selectedTeamRequest.team_name}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-600">Kapitán: {selectedTeamRequest.captain_name} / {selectedTeamRequest.captain_email}</p>
                  {selectedTeamRequest.captain_phone ? <p className="mt-1 text-sm font-bold text-slate-600">Telefon: {selectedTeamRequest.captain_phone}</p> : null}
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Adresa: {selectedTeamRequest.captain_address || "-"} / Datum narození: {formatPlainDate(selectedTeamRequest.captain_date_of_birth)}
                  </p>
                  {selectedTeamRequest.assistant_captain_name ? (
                    <div className="mt-3 rounded-2xl border border-[var(--admin-border)] bg-[#F4F8FF] p-3 text-sm font-bold text-slate-600">
                      <p>Zástupce kapitána: {selectedTeamRequest.assistant_captain_name}</p>
                      <p>
                        Kontakt: {selectedTeamRequest.assistant_captain_email || "-"}
                        {selectedTeamRequest.assistant_captain_phone ? ` / ${selectedTeamRequest.assistant_captain_phone}` : ""}
                      </p>
                      <p>
                        Adresa: {selectedTeamRequest.assistant_captain_address || "-"} / Datum narození: {formatPlainDate(selectedTeamRequest.assistant_captain_date_of_birth)}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm font-black text-[#061A3A]">
                    Zájem o pořádání Major turnaje: {selectedTeamRequest.wants_major_tournament ? "ano" : "ne"}
                  </p>
                </div>
                <span className={statusClass(selectedTeamRequest.status)}>{statusLabels[selectedTeamRequest.status]}</span>
              </div>
              {selectedTeamRequest.note ? <p className="mt-4 text-sm text-slate-600">{selectedTeamRequest.note}</p> : null}

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-[#EEF5FF] text-slate-600">
                    <tr>
                      <th className="px-3 py-3">Hráč</th>
                      <th className="px-3 py-3">Kontakt</th>
                      <th className="px-3 py-3">Údaje</th>
                      <th className="px-3 py-3">Stav</th>
                      <th className="px-3 py-3">Existující hráč</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeamRequest.roster.map((player) => (
                      <tr className="border-t border-[var(--admin-border)]" key={player.id}>
                        <td className="px-3 py-3 font-black text-[#061A3A]">
                          {playerName(player)}
                          {player.note ? <p className="mt-1 text-xs font-bold text-slate-500">{player.note}</p> : null}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{player.email || "-"}<br />{player.phone || ""}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {player.address || "-"}
                          <br />
                          {formatPlainDate(player.date_of_birth)}
                        </td>
                        <td className="px-3 py-3"><span className={playerStatusClass(player.player_status)}>{playerStatusLabels[player.player_status]}</span></td>
                        <td className="px-3 py-3">
                          <select
                            className="w-full rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm font-bold"
                            onChange={(event) => setRosterMatches((current) => ({
                              ...current,
                              [selectedTeamRequest.id]: {
                                ...(current[selectedTeamRequest.id] ?? {}),
                                [player.id]: event.target.value,
                              },
                            }))}
                            value={(rosterMatches[selectedTeamRequest.id] ?? {})[player.id] ?? player.matched_player_id ?? ""}
                          >
                            <option value="">Vytvořit nového hráče</option>
                            {players.map((option) => <option key={option.id} value={option.id}>{option.display_name}{option.email ? ` / ${option.email}` : ""}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <textarea
                className="mt-5 min-h-24 w-full rounded-2xl border border-[var(--admin-border)] px-4 py-3 text-sm outline-none focus:border-[#3B82F6]"
                onChange={(event) => setNotes((current) => ({ ...current, [selectedTeamRequest.id]: event.target.value }))}
                placeholder="Admin poznámka"
                value={notes[selectedTeamRequest.id] ?? selectedTeamRequest.admin_note ?? ""}
              />
              {selectedTeamRequest.status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={processingId === selectedTeamRequest.id} onClick={() => review("team", selectedTeamRequest.id, "approve")} variant="primary">Schválit</Button>
                  <Button disabled={processingId === selectedTeamRequest.id} onClick={() => review("team", selectedTeamRequest.id, "reject")} variant="danger">Zamítnout</Button>
                </div>
              ) : selectedTeamRequest.status === "approved" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={processingId === selectedTeamRequest.id} onClick={() => review("team", selectedTeamRequest.id, "approve")} variant="primary">Znovu zpracovat soupisku</Button>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--admin-border)] pt-4">
                <Button disabled={processingId === selectedTeamRequest.id} onClick={() => deleteRequest("team", selectedTeamRequest.id)} variant="danger">
                  Odstranit žádost
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <Card className="p-0">
            <div className="border-b border-[var(--admin-border)] px-5 py-4">
              <h2 className="text-lg font-black text-[#061A3A]">Žádosti jednotlivců</h2>
            </div>
            {isLoading ? (
              <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Načítám žádosti...</p>
            ) : playerRequests.length === 0 ? (
              <p className="p-5 text-sm font-bold text-[var(--admin-muted)]">Žádosti zatím nejsou k dispozici.</p>
            ) : (
              <div className="divide-y divide-[var(--admin-border)]">
                {playerRequests.map((request) => (
                  <button
                    className={`block w-full px-5 py-4 text-left transition hover:bg-[#F4F8FF] ${selectedPlayerRequest?.id === request.id ? "bg-[#F4F8FF]" : "bg-white"}`}
                    key={request.id}
                    onClick={() => setSelectedPlayerId(request.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[#061A3A]">{playerName(request)}</h3>
                      <span className={statusClass(request.status)}>{statusLabels[request.status]}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-600">{request.email}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(request.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {selectedPlayerRequest ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-[#061A3A]">{playerName(selectedPlayerRequest)}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-600">{selectedPlayerRequest.email}</p>
                  {selectedPlayerRequest.phone ? <p className="mt-1 text-sm font-bold text-slate-600">Telefon: {selectedPlayerRequest.phone}</p> : null}
                </div>
                <span className={statusClass(selectedPlayerRequest.status)}>{statusLabels[selectedPlayerRequest.status]}</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Stav hráče</p>
                  <span className={`mt-2 inline-flex ${playerStatusClass(selectedPlayerRequest.player_status)}`}>{playerStatusLabels[selectedPlayerRequest.player_status]}</span>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Tým</p>
                  <p className="mt-2 font-black text-[#061A3A]">{selectedPlayerRequest.preferred_team_name || (selectedPlayerRequest.looking_for_team ? "Hledá tým" : "Bez preference")}</p>
                </div>
              </div>

              {selectedPlayerRequest.note ? <p className="mt-5 text-sm text-slate-600">{selectedPlayerRequest.note}</p> : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Existující hráč
                  <select
                    className="rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm font-bold"
                    onChange={(event) => setPlayerMatches((current) => ({ ...current, [selectedPlayerRequest.id]: event.target.value }))}
                    value={playerMatches[selectedPlayerRequest.id] ?? selectedPlayerRequest.matched_player_id ?? ""}
                  >
                    <option value="">Vytvořit nového hráče</option>
                    {players.map((option) => <option key={option.id} value={option.id}>{option.display_name}{option.email ? ` / ${option.email}` : ""}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-black text-[#061A3A]">
                  Preferovaný tým
                  <select
                    className="rounded-xl border border-[var(--admin-border)] bg-white px-3 py-2 text-sm font-bold"
                    onChange={(event) => setPreferredTeams((current) => ({ ...current, [selectedPlayerRequest.id]: event.target.value }))}
                    value={preferredTeams[selectedPlayerRequest.id] ?? selectedPlayerRequest.preferred_team_id ?? ""}
                  >
                    <option value="">Bez týmu</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>

              <textarea
                className="mt-5 min-h-24 w-full rounded-2xl border border-[var(--admin-border)] px-4 py-3 text-sm outline-none focus:border-[#3B82F6]"
                onChange={(event) => setNotes((current) => ({ ...current, [selectedPlayerRequest.id]: event.target.value }))}
                placeholder="Admin poznámka"
                value={notes[selectedPlayerRequest.id] ?? selectedPlayerRequest.admin_note ?? ""}
              />
              {selectedPlayerRequest.status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={processingId === selectedPlayerRequest.id} onClick={() => review("player", selectedPlayerRequest.id, "approve")} variant="primary">Schválit</Button>
                  <Button disabled={processingId === selectedPlayerRequest.id} onClick={() => review("player", selectedPlayerRequest.id, "reject")} variant="danger">Zamítnout</Button>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--admin-border)] pt-4">
                <Button disabled={processingId === selectedPlayerRequest.id} onClick={() => deleteRequest("player", selectedPlayerRequest.id)} variant="danger">
                  Odstranit žádost
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
