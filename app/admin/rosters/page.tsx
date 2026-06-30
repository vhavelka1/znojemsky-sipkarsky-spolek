"use client";

import { adminFetch } from "@/lib/adminFetch";
import { useCallback, useEffect, useMemo, useState } from "react";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
  ends_on?: string;
};

type Team = {
  id: string;
  name: string;
};

type Player = {
  id: string;
  display_name: string;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
  registration_status?: TeamSeasonRegistrationStatus;
  registration_submitted_at?: string | null;
  registration_reviewed_at?: string | null;
  registration_note?: string | null;
  registration_admin_note?: string | null;
};

type TeamSeasonRegistrationStatus = "draft" | "submitted" | "approved" | "returned" | "cancelled";

type MemberRole = "player" | "captain" | "assistant_captain";

type Membership = {
  id: string;
  season_id: string;
  team_season_id: string;
  player_id: string;
  member_role: MemberRole;
  joined_on: string;
  left_on: string | null;
};

type League = {
  id: string;
  season_id: string;
  name: string;
};

type LeagueGroup = {
  id: string;
  league_id: string;
  name: string;
};

type LeagueGroupTeam = {
  id: string;
  league_group_id: string;
  team_season_id: string;
};

type MembershipPayload = {
  players?: Player[];
  teams?: Team[];
  seasons?: Season[];
  teamSeasons?: TeamSeason[];
  memberships?: Membership[];
  error?: string;
};

type LeaguePayload = {
  leagues?: League[];
  groups?: LeagueGroup[];
  assignments?: LeagueGroupTeam[];
  error?: string;
};

type RosterForm = {
  season_id: string;
  team_id: string;
  player_id: string;
  member_role: MemberRole;
  joined_on: string;
  left_on: string;
};

const emptyForm: RosterForm = {
  season_id: "",
  team_id: "",
  player_id: "",
  member_role: "player",
  joined_on: "",
  left_on: "",
};

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T;
}

async function fetchRosterData() {
  const [membershipResponse, leagueResponse] = await Promise.all([
    adminFetch("/api/admin/memberships"),
    adminFetch("/api/admin/leagues"),
  ]);
  const membershipBody = await readJson<MembershipPayload>(membershipResponse);
  const leagueBody = await readJson<LeaguePayload>(leagueResponse);

  if (!membershipResponse.ok) {
    throw new Error(membershipBody.error ?? "Nepodařilo se načíst členství.");
  }

  if (!leagueResponse.ok) {
    throw new Error(leagueBody.error ?? "Nepodařilo se načíst ligy.");
  }

  return {
    players: membershipBody.players ?? [],
    teams: membershipBody.teams ?? [],
    seasons: membershipBody.seasons ?? [],
    teamSeasons: membershipBody.teamSeasons ?? [],
    memberships: membershipBody.memberships ?? [],
    leagues: leagueBody.leagues ?? [],
    groups: leagueBody.groups ?? [],
    assignments: leagueBody.assignments ?? [],
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function memberRoleLabel(role: MemberRole) {
  if (role === "captain") {
    return "Kapitán";
  }

  if (role === "assistant_captain") {
    return "Zástupce kapitána";
  }

  return "Hráč";
}

function registrationStatusLabel(status: TeamSeasonRegistrationStatus | undefined) {
  if (status === "submitted") return "Odesláno ke schválení";
  if (status === "approved") return "Schváleno";
  if (status === "returned") return "Vráceno k doplnění";
  if (status === "cancelled") return "Zrušeno";
  return "Rozpracováno";
}

function registrationStatusClass(status: TeamSeasonRegistrationStatus | undefined) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  if (status === "returned") return "bg-amber-50 text-amber-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-700";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminRostersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [assignments, setAssignments] = useState<LeagueGroupTeam[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [selectedTeamSeasonId, setSelectedTeamSeasonId] = useState("");
  const [form, setForm] = useState<RosterForm>(emptyForm);
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<RosterForm>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const teamSeasonById = useMemo(() => new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])), [teamSeasons]);
  const activeSeason = useMemo(() => seasons.find((season) => season.id === selectedSeasonId), [seasons, selectedSeasonId]);
  const getTeamSeasonLabel = useCallback(
    (teamSeason: TeamSeason) =>
      teamSeason.display_name || teamById.get(teamSeason.team_id)?.name || "Neznámý tým",
    [teamById],
  );

  const filteredLeagues = useMemo(
    () => leagues.filter((league) => league.season_id === selectedSeasonId),
    [leagues, selectedSeasonId],
  );

  const selectedLeagueGroupIds = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => group.league_id === selectedLeagueId)
          .map((group) => group.id),
      ),
    [groups, selectedLeagueId],
  );

  const leagueTeamSeasonIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((assignment) => selectedLeagueGroupIds.has(assignment.league_group_id))
          .map((assignment) => assignment.team_season_id),
      ),
    [assignments, selectedLeagueGroupIds],
  );

  const getGroupNames = useCallback(
    (teamSeasonId: string) =>
      assignments
        .filter((assignment) => assignment.team_season_id === teamSeasonId)
        .map((assignment) => groupById.get(assignment.league_group_id))
        .filter((group): group is LeagueGroup => Boolean(group))
        .filter((group) => !selectedLeagueId || group.league_id === selectedLeagueId)
        .map((group) => group.name),
    [assignments, groupById, selectedLeagueId],
  );

  const availableTeamSeasons = useMemo(() => {
    const seasonTeamSeasons = teamSeasons.filter(
      (teamSeason) => teamSeason.season_id === selectedSeasonId,
    );
    const scopedTeamSeasons = selectedLeagueId
      ? seasonTeamSeasons.filter((teamSeason) => leagueTeamSeasonIds.has(teamSeason.id))
      : seasonTeamSeasons;

    return scopedTeamSeasons.sort((first, second) =>
      getTeamSeasonLabel(first).localeCompare(getTeamSeasonLabel(second), "cs"),
    );
  }, [getTeamSeasonLabel, leagueTeamSeasonIds, selectedLeagueId, selectedSeasonId, teamSeasons]);

  const rosterTeamSeasons = useMemo(
    () =>
      availableTeamSeasons.filter(
        (teamSeason) => !selectedTeamSeasonId || teamSeason.id === selectedTeamSeasonId,
      ),
    [availableTeamSeasons, selectedTeamSeasonId],
  );

  const rosters = useMemo(
    () =>
      rosterTeamSeasons.map((teamSeason) => {
        const teamMemberships = memberships
          .filter(
            (membership) =>
              membership.season_id === selectedSeasonId &&
              membership.team_season_id === teamSeason.id,
          )
          .sort((first, second) => {
            if (first.left_on && !second.left_on) return 1;
            if (!first.left_on && second.left_on) return -1;
            const firstPlayer = playerById.get(first.player_id)?.display_name ?? "";
            const secondPlayer = playerById.get(second.player_id)?.display_name ?? "";
            return firstPlayer.localeCompare(secondPlayer, "cs");
          });

        return {
          teamSeason,
          groupNames: getGroupNames(teamSeason.id),
          memberships: teamMemberships,
        };
      }),
    [getGroupNames, memberships, playerById, rosterTeamSeasons, selectedSeasonId],
  );

  async function loadData(showLoading = true) {
    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const data = await fetchRosterData();
      setPlayers(data.players);
      setTeams(data.teams);
      setSeasons(data.seasons);
      setTeamSeasons(data.teamSeasons);
      setMemberships(data.memberships);
      setLeagues(data.leagues);
      setGroups(data.groups);
      setAssignments(data.assignments);

      const season = data.seasons.find((item) => item.id === selectedSeasonId)
        ?? data.seasons.find((item) => item.is_active)
        ?? data.seasons[0];
      const seasonId = season?.id ?? "";
      setSelectedSeasonId(seasonId);
      setSelectedLeagueId((current) =>
        data.leagues.some((league) => league.id === current && league.season_id === seasonId) ? current : "",
      );
      setForm((current) => ({
        ...current,
        season_id: current.season_id || seasonId,
        joined_on: current.joined_on || season?.starts_on || todayIsoDate(),
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Soupisky se nepodařilo načíst.");
    }

    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setForm({
      ...emptyForm,
      season_id: selectedSeasonId,
      team_id: selectedTeamSeasonId ? teamSeasonById.get(selectedTeamSeasonId)?.team_id ?? "" : "",
      joined_on: activeSeason?.starts_on || todayIsoDate(),
    });
  }

  async function handleCreate() {
    if (!form.player_id || !form.team_id || !form.season_id || !form.joined_on) {
      setError("Vyberte hráče, tým, sezónu a datum od.");
      return;
    }

    setBusyId("create");
    setError(null);
    setMessage(null);

    const response = await adminFetch("/api/admin/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: form.player_id,
        team_id: form.team_id,
        season_id: form.season_id,
        member_role: form.member_role,
        joined_on: form.joined_on,
      }),
    });
    const body = await readJson<{ error?: string }>(response);

    if (!response.ok) {
      setError(body.error ?? "Hráče se nepodařilo přidat do soupisky.");
    } else {
      setMessage("Hráč byl přidán do soupisky.");
      resetForm();
      await loadData(false);
    }

    setBusyId(null);
  }

  function startEditing(membership: Membership) {
    const teamSeason = teamSeasonById.get(membership.team_season_id);
    setEditingMembershipId(membership.id);
    setEditingForm({
      season_id: membership.season_id,
      team_id: teamSeason?.team_id ?? "",
      player_id: membership.player_id,
      member_role: membership.member_role,
      joined_on: membership.joined_on,
      left_on: membership.left_on ?? "",
    });
  }

  function cancelEditing() {
    setEditingMembershipId(null);
    setEditingForm(emptyForm);
  }

  async function handleUpdate(membershipId: string) {
    if (!editingForm.team_id || !editingForm.season_id || !editingForm.joined_on) {
      setError("Vyberte tým, sezónu a datum od.");
      return;
    }

    setBusyId(membershipId);
    setError(null);
    setMessage(null);

    const response = await adminFetch(`/api/admin/memberships/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: editingForm.team_id,
        season_id: editingForm.season_id,
        member_role: editingForm.member_role,
        joined_on: editingForm.joined_on,
        left_on: editingForm.left_on || null,
      }),
    });
    const body = await readJson<{ error?: string }>(response);

    if (!response.ok) {
      setError(body.error ?? "Členství se nepodařilo upravit.");
    } else {
      setMessage("Členství bylo upraveno.");
      cancelEditing();
      await loadData(false);
    }

    setBusyId(null);
  }

  async function handleDelete(membershipId: string) {
    if (!window.confirm("Opravdu chcete odstranit hráče ze soupisky?")) {
      return;
    }

    setBusyId(membershipId);
    setError(null);
    setMessage(null);

    const response = await adminFetch(`/api/admin/memberships/${membershipId}`, {
      method: "DELETE",
    });
    const body = await readJson<{ error?: string }>(response);

    if (!response.ok) {
      setError(body.error ?? "Členství se nepodařilo odstranit.");
    } else {
      setMessage("Hráč byl odstraněn ze soupisky.");
      await loadData(false);
    }

    setBusyId(null);
  }

  async function handleRegistrationAction(teamSeasonId: string, action: "approve" | "return" | "cancel" | "draft") {
    const note = action === "return" ? window.prompt("Poznámka pro kapitána:", "") : "";
    if (note === null) return;

    setBusyId(`registration-${teamSeasonId}`);
    setError(null);
    setMessage(null);

    const response = await adminFetch(`/api/admin/team-seasons/${teamSeasonId}/registration`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, admin_note: note }),
    });
    const body = await readJson<{ error?: string }>(response);

    if (!response.ok) {
      setError(body.error ?? "Stav účasti týmu se nepodařilo uložit.");
    } else {
      setMessage("Stav účasti týmu byl uložen.");
      await loadData(false);
    }

    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Soupisky</h2>
        </div>
      </header>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Sezóna
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={selectedSeasonId}
              onChange={(event) => {
                const seasonId = event.target.value;
                const season = seasons.find((item) => item.id === seasonId);
                setSelectedSeasonId(seasonId);
                setSelectedLeagueId("");
                setSelectedTeamSeasonId("");
                setForm((current) => ({ ...current, season_id: seasonId, team_id: "", joined_on: season?.starts_on || current.joined_on }));
              }}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Liga
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={selectedLeagueId}
              onChange={(event) => {
                setSelectedLeagueId(event.target.value);
                setSelectedTeamSeasonId("");
              }}
            >
              <option value="">Všechny ligy</option>
              {filteredLeagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tým
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={selectedTeamSeasonId}
              onChange={(event) => {
                const teamSeasonId = event.target.value;
                setSelectedTeamSeasonId(teamSeasonId);
                setForm((current) => ({ ...current, team_id: teamSeasonById.get(teamSeasonId)?.team_id ?? "" }));
              }}
            >
              <option value="">Všechny týmy</option>
              {availableTeamSeasons.map((teamSeason) => (
                <option key={teamSeason.id} value={teamSeason.id}>
                  {getTeamSeasonLabel(teamSeason)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Přidat hráče do soupisky</h3>
            <p className="mt-1 text-sm text-slate-500">Moderátor i administrátor mohou upravovat soupisky přímo zde.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Hráč
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={form.player_id}
              onChange={(event) => setForm({ ...form, player_id: event.target.value })}
            >
              <option value="">Vyberte hráče</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.display_name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tým
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={form.team_id}
              onChange={(event) => setForm({ ...form, team_id: event.target.value })}
            >
              <option value="">Vyberte tým</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Role
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={form.member_role}
              onChange={(event) => setForm({ ...form, member_role: event.target.value as MemberRole })}
            >
              <option value="player">Hráč</option>
              <option value="captain">Kapitán</option>
              <option value="assistant_captain">Zástupce kapitána</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Od
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              type="date"
              value={form.joined_on}
              onChange={(event) => setForm({ ...form, joined_on: event.target.value })}
            />
          </label>
          <button
            className="rounded-md bg-[#EF233C] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32] disabled:cursor-not-allowed disabled:bg-slate-400 lg:self-end"
            disabled={busyId === "create"}
            onClick={handleCreate}
            type="button"
          >
            {busyId === "create" ? "Ukládám..." : "Přidat do soupisky"}
          </button>
        </div>
      </section>

      {message ? (
        <section className="rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 shadow-sm">
          {message}
        </section>
      ) : null}

      {error ? (
        <section className="rounded-lg bg-white p-6 text-sm text-red-700 shadow-sm">
          {error}
        </section>
      ) : null}

      {isLoading ? (
        <section className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">
          Načítám soupisky...
        </section>
      ) : rosters.length === 0 ? (
        <section className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">
          Pro zvolený filtr nebyly nalezeny žádné týmy.
        </section>
      ) : (
        <div className="grid gap-6">
          {rosters.map(({ teamSeason, groupNames, memberships: teamMemberships }) => (
            <section className="rounded-lg bg-white shadow-sm" key={teamSeason.id}>
              <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{getTeamSeasonLabel(teamSeason)}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registrationStatusClass(teamSeason.registration_status)}`}>
                      {registrationStatusLabel(teamSeason.registration_status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {groupNames.length > 0 ? groupNames.join(", ") : "Bez přiřazené skupiny"}
                  </p>
                  {teamSeason.registration_note ? (
                    <p className="mt-2 text-sm text-slate-600">Poznámka kapitána: {teamSeason.registration_note}</p>
                  ) : null}
                  {teamSeason.registration_admin_note ? (
                    <p className="mt-1 text-sm text-amber-700">Poznámka administrace: {teamSeason.registration_admin_note}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Aktivní: {teamMemberships.filter((membership) => !membership.left_on).length}
                  </span>
                  {teamSeason.registration_status === "submitted" ? (
                    <>
                      <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-400"
                        disabled={busyId === `registration-${teamSeason.id}`}
                        onClick={() => handleRegistrationAction(teamSeason.id, "approve")}
                        type="button"
                      >
                        Schválit účast
                      </button>
                      <button
                        className="rounded-md border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-60"
                        disabled={busyId === `registration-${teamSeason.id}`}
                        onClick={() => handleRegistrationAction(teamSeason.id, "return")}
                        type="button"
                      >
                        Vrátit k doplnění
                      </button>
                    </>
                  ) : null}
                  {teamSeason.registration_status === "approved" ? (
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                      disabled={busyId === `registration-${teamSeason.id}`}
                      onClick={() => handleRegistrationAction(teamSeason.id, "return")}
                      type="button"
                    >
                      Vrátit
                    </button>
                  ) : null}
                </div>
              </div>

              {teamMemberships.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Tým nemá pro zvolené období žádné členy.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Hráč</th>
                        <th className="px-6 py-3 font-semibold">Role</th>
                        <th className="px-6 py-3 font-semibold">Od</th>
                        <th className="px-6 py-3 font-semibold">Do</th>
                        <th className="px-6 py-3 font-semibold">Stav</th>
                        <th className="px-6 py-3 font-semibold">Akce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {teamMemberships.map((membership) => {
                        const isEditing = editingMembershipId === membership.id;
                        const isBusy = busyId === membership.id;

                        return (
                          <tr key={membership.id}>
                            <td className="px-6 py-4 font-medium">
                              {playerById.get(membership.player_id)?.display_name ?? "Neznámý hráč"}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing ? (
                                <select
                                  className="min-w-40 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  value={editingForm.member_role}
                                  onChange={(event) => setEditingForm({ ...editingForm, member_role: event.target.value as MemberRole })}
                                >
                                  <option value="player">Hráč</option>
                                  <option value="captain">Kapitán</option>
                                  <option value="assistant_captain">Zástupce kapitána</option>
                                </select>
                              ) : (
                                memberRoleLabel(membership.member_role)
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing ? (
                                <input
                                  className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  type="date"
                                  value={editingForm.joined_on}
                                  onChange={(event) => setEditingForm({ ...editingForm, joined_on: event.target.value })}
                                />
                              ) : (
                                formatDate(membership.joined_on)
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing ? (
                                <input
                                  className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  type="date"
                                  value={editingForm.left_on}
                                  onChange={(event) => setEditingForm({ ...editingForm, left_on: event.target.value })}
                                />
                              ) : (
                                formatDate(membership.left_on)
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  membership.left_on
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {membership.left_on ? "Ukončeno" : "Aktivní"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    disabled={isBusy}
                                    onClick={() => handleUpdate(membership.id)}
                                    type="button"
                                  >
                                    Uložit
                                  </button>
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                    disabled={isBusy}
                                    onClick={cancelEditing}
                                    type="button"
                                  >
                                    Zrušit
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={() => startEditing(membership)}
                                    type="button"
                                  >
                                    Upravit
                                  </button>
                                  <button
                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                                    disabled={isBusy}
                                    onClick={() => handleDelete(membership.id)}
                                    type="button"
                                  >
                                    Odstranit
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
