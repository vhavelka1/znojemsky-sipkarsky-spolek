"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const mockRole = "admin";

type Player = {
  id: string;
  display_name: string;
};

type Team = {
  id: string;
  name: string;
};

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
  ends_on: string;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type Membership = {
  id: string;
  season_id: string;
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
  joined_on: string;
  left_on: string | null;
  created_at: string;
};

type MembershipPayload = {
  players?: Player[];
  teams?: Team[];
  seasons?: Season[];
  teamSeasons?: TeamSeason[];
  membership?: Membership;
  memberships?: Membership[];
  error?: string;
};

type MembershipForm = {
  player_id: string;
  team_id: string;
  season_id: string;
  member_role: "player" | "captain" | "assistant_captain";
};

type MembershipEditForm = {
  team_id: string;
  season_id: string;
  member_role: Membership["member_role"];
  joined_on: string;
  left_on: string;
};

const emptyForm: MembershipForm = {
  player_id: "",
  team_id: "",
  season_id: "",
  member_role: "player",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as MembershipPayload;
}

async function fetchMembershipData() {
  const response = await fetch("/api/admin/memberships");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error("Nepodařilo se načíst členství.");
  }

  return {
    players: body.players ?? [],
    teams: body.teams ?? [],
    seasons: body.seasons ?? [],
    teamSeasons: body.teamSeasons ?? [],
    memberships: body.memberships ?? [],
  };
}

function memberRoleLabel(role: Membership["member_role"]) {
  if (role === "captain") {
    return "Kapitán";
  }

  if (role === "assistant_captain") {
    return "Zástupce kapitána";
  }

  return "Hráč";
}

export default function AdminMembershipsPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [form, setForm] = useState<MembershipForm>(emptyForm);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MembershipEditForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageMemberships = mockRole === "admin";

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const seasonById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season])),
    [seasons],
  );
  const teamSeasonById = useMemo(
    () => new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])),
    [teamSeasons],
  );
  const filteredMemberships = useMemo(
    () =>
      memberships.filter((membership) => {
        if (selectedSeasonId && membership.season_id !== selectedSeasonId) {
          return false;
        }

        if (selectedTeamId) {
          const teamSeason = teamSeasonById.get(membership.team_season_id);
          if (teamSeason?.team_id !== selectedTeamId) {
            return false;
          }
        }

        return true;
      }),
    [memberships, selectedSeasonId, selectedTeamId, teamSeasonById],
  );

  async function loadMembershipData(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const loadedData = await fetchMembershipData();
      setPlayers(loadedData.players);
      setTeams(loadedData.teams);
      setSeasons(loadedData.seasons);
      setTeamSeasons(loadedData.teamSeasons);
      setMemberships(loadedData.memberships);
      setEditingMembershipId(null);
      setEditForm(null);

      setForm((currentForm) => ({
        player_id: currentForm.player_id || loadedData.players[0]?.id || "",
        team_id: currentForm.team_id || loadedData.teams[0]?.id || "",
        season_id:
          currentForm.season_id ||
          loadedData.seasons.find((season) => season.is_active)?.id ||
          loadedData.seasons[0]?.id ||
          "",
        member_role: currentForm.member_role,
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Nepodařilo se načíst členství.",
      );
      setMemberships([]);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchMembershipData()
      .then((loadedData) => {
        if (!isMounted) {
          return;
        }

        setPlayers(loadedData.players);
        setTeams(loadedData.teams);
        setSeasons(loadedData.seasons);
        setTeamSeasons(loadedData.teamSeasons);
        setMemberships(loadedData.memberships);
        setForm({
          player_id: loadedData.players[0]?.id || "",
          team_id: loadedData.teams[0]?.id || "",
          season_id:
            loadedData.seasons.find((season) => season.is_active)?.id ||
            loadedData.seasons[0]?.id ||
            "",
          member_role: "player",
        });
        setSelectedSeasonId(
          loadedData.seasons.find((season) => season.is_active)?.id ||
            loadedData.seasons[0]?.id ||
            "",
        );
        setSelectedTeamId("");
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Nepodařilo se načíst členství.",
        );
        setMemberships([]);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageMemberships || !form.player_id || !form.team_id || !form.season_id) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch("/api/admin/memberships", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    await readJson(response);

    if (!response.ok) {
      setError("Nepodařilo se přiřadit hráče.");
    } else {
      await loadMembershipData(false);
    }

    setIsSaving(false);
  }

  function startEditingMembership(membership: Membership) {
    const teamSeason = teamSeasonById.get(membership.team_season_id);

    setEditingMembershipId(membership.id);
    setEditForm({
      joined_on: membership.joined_on,
      left_on: membership.left_on ?? "",
      member_role: membership.member_role,
      season_id: membership.season_id,
      team_id: teamSeason?.team_id ?? "",
    });
  }

  function cancelEditingMembership() {
    setEditingMembershipId(null);
    setEditForm(null);
  }

  async function handleUpdateMembership(membershipId: string) {
    if (!editForm?.team_id || !editForm.season_id || !editForm.joined_on) {
      return;
    }

    setBusyMembershipId(membershipId);
    setError(null);

    const response = await fetch(`/api/admin/memberships/${membershipId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        joined_on: editForm.joined_on,
        left_on: editForm.left_on || null,
        member_role: editForm.member_role,
        season_id: editForm.season_id,
        team_id: editForm.team_id,
      }),
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Nepodařilo se upravit členství.");
    } else {
      await loadMembershipData(false);
    }

    setBusyMembershipId(null);
  }

  function getTeamLabel(teamSeasonId: string) {
    const teamSeason = teamSeasonById.get(teamSeasonId);
    if (!teamSeason) {
      return "Neznámý tým";
    }

    return teamSeason.display_name || teamById.get(teamSeason.team_id)?.name || "Neznámý tým";
  }

  function getSeasonLabel(seasonId: string) {
    return seasonById.get(seasonId)?.name || "Neznámá sezóna";
  }

  function getPlayerLabel(playerId: string) {
    const player = playerById.get(playerId);
    if (!player) {
      return "Neznámý hráč";
    }

    return player.display_name;
  }

  return (
    <div className="flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Členství</h2>
        </header>

        {!canManageMemberships ? (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Aktuální testovací role neumožňuje správu členství.
            </p>
          </section>
        ) : (
          <>
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Filtrovat podle týmu
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={selectedTeamId}
                  onChange={(event) => {
                    setSelectedTeamId(event.target.value);
                    cancelEditingMembership();
                  }}
                >
                  <option value="">Všechny týmy</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Filtrovat podle sezóny
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={selectedSeasonId}
                  onChange={(event) => {
                    setSelectedSeasonId(event.target.value);
                    cancelEditingMembership();
                  }}
                >
                  <option value="">Všechny sezóny</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                      {season.is_active ? " - aktivní" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Přiřadit hráče</h3>

              <form className="mt-5 flex flex-col gap-4" onSubmit={handleAssign}>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Hráč
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={form.player_id}
                    onChange={(event) =>
                      setForm({ ...form, player_id: event.target.value })
                    }
                  >
                    <option value="">Vyberte hráče</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.display_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Tým
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={form.team_id}
                    onChange={(event) => setForm({ ...form, team_id: event.target.value })}
                  >
                    <option value="">Vyberte tým</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Sezóna
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={form.season_id}
                    onChange={(event) =>
                      setForm({ ...form, season_id: event.target.value })
                    }
                  >
                    <option value="">Vyberte sezónu</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                        {season.is_active ? " - aktivní" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Role v týmu
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    value={form.member_role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        member_role: event.target.value as MembershipForm["member_role"],
                      })
                    }
                  >
                    <option value="player">Hráč</option>
                    <option value="captain">Kapitán</option>
                    <option value="assistant_captain">Zástupce kapitána</option>
                  </select>
                </label>

                <button
                  className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={isSaving || players.length === 0 || teams.length === 0 || seasons.length === 0}
                  type="submit"
                >
                  {isSaving ? "Ukládám..." : "Přiřadit nebo přestoupit"}
                </button>
              </form>
            </section>

            <section className="rounded-lg bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold">Historie členství</h3>
              </div>

              {error ? (
                <div className="px-6 py-5 text-sm text-red-700">{error}</div>
              ) : null}

              {isLoading ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Načítám členství...
                </div>
              ) : memberships.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Nebyla nalezena žádná členství.
                </div>
              ) : filteredMemberships.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Pro zvolený filtr nebyla nalezena žádná členství.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Hráč</th>
                        <th className="px-6 py-3 font-semibold">Tým</th>
                        <th className="px-6 py-3 font-semibold">Sezóna</th>
                        <th className="px-6 py-3 font-semibold">Role</th>
                        <th className="px-6 py-3 font-semibold">Od</th>
                        <th className="px-6 py-3 font-semibold">Do</th>
                        <th className="px-6 py-3 font-semibold">Stav</th>
                        <th className="px-6 py-3 font-semibold">Akce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredMemberships.map((membership) => {
                        const isEditing = editingMembershipId === membership.id;
                        const isBusy = busyMembershipId === membership.id;

                        return (
                          <tr key={membership.id}>
                            <td className="px-6 py-4 font-medium">
                              {getPlayerLabel(membership.player_id)}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing && editForm ? (
                                <select
                                  className="min-w-44 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  value={editForm.team_id}
                                  onChange={(event) =>
                                    setEditForm({ ...editForm, team_id: event.target.value })
                                  }
                                >
                                  <option value="">Vyberte tým</option>
                                  {teams.map((team) => (
                                    <option key={team.id} value={team.id}>
                                      {team.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                getTeamLabel(membership.team_season_id)
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing && editForm ? (
                                <select
                                  className="min-w-44 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  value={editForm.season_id}
                                  onChange={(event) =>
                                    setEditForm({ ...editForm, season_id: event.target.value })
                                  }
                                >
                                  <option value="">Vyberte sezónu</option>
                                  {seasons.map((season) => (
                                    <option key={season.id} value={season.id}>
                                      {season.name}
                                      {season.is_active ? " - aktivní" : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                getSeasonLabel(membership.season_id)
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing && editForm ? (
                                <select
                                  className="min-w-40 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  value={editForm.member_role}
                                  onChange={(event) =>
                                    setEditForm({
                                      ...editForm,
                                      member_role: event.target.value as Membership["member_role"],
                                    })
                                  }
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
                              {isEditing && editForm ? (
                                <input
                                  className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  required
                                  type="date"
                                  value={editForm.joined_on}
                                  onChange={(event) =>
                                    setEditForm({ ...editForm, joined_on: event.target.value })
                                  }
                                />
                              ) : (
                                membership.joined_on
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {isEditing && editForm ? (
                                <input
                                  className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                                  disabled={isBusy}
                                  type="date"
                                  value={editForm.left_on}
                                  onChange={(event) =>
                                    setEditForm({ ...editForm, left_on: event.target.value })
                                  }
                                />
                              ) : (
                                membership.left_on || "-"
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={
                                  membership.left_on
                                    ? "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                                    : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                }
                              >
                                {membership.left_on ? "Historické" : "Aktivní"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <div className="flex gap-2">
                                  <button
                                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    disabled={isBusy}
                                    onClick={() => handleUpdateMembership(membership.id)}
                                    type="button"
                                  >
                                    Uložit
                                  </button>
                                  <button
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                    disabled={isBusy}
                                    onClick={cancelEditingMembership}
                                    type="button"
                                  >
                                    Zrušit
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                  onClick={() => startEditingMembership(membership)}
                                  type="button"
                                >
                                  Upravit
                                </button>
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
          </div>
          </>
        )}
    </div>
  );
}
