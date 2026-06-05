"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

const mockRole = "admin";

type Team = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  playing_venue_address: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type Season = {
  id: string;
  name: string;
  is_active: boolean;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type Player = {
  id: string;
  display_name: string;
};

type MemberRole = "player" | "captain" | "assistant_captain";

type Membership = {
  id: string;
  team_season_id: string;
  player_id: string;
  member_role: MemberRole;
  left_on: string | null;
};

type TeamForm = {
  name: string;
  playing_venue_address: string;
};

type LeadershipDraft = {
  captain_player_id: string;
  assistant_player_ids: string[];
};

const emptyForm: TeamForm = {
  name: "",
  playing_venue_address: "",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    activeSeason?: Season | null;
    error?: string;
    memberships?: Membership[];
    players?: Player[];
    teams?: Team[];
    team?: Team;
    teamSeasons?: TeamSeason[];
  };
}

async function fetchTeams() {
  const response = await fetch("/api/admin/teams");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      body.error?.includes("logo_url")
        ? "Nejprve spusťte SQL soubor supabase/apply_team_logos_in_dashboard.sql v Supabase SQL Editoru."
        : body.error ?? "Nepodařilo se načíst týmy.",
    );
  }

  return {
    activeSeason: body.activeSeason ?? null,
    memberships: body.memberships ?? [],
    players: body.players ?? [],
    teams: body.teams ?? [],
    teamSeasons: body.teamSeasons ?? [],
  };
}

function playerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.display_name ?? "Neznámý hráč";
}

function createLeadershipDraft(memberships: Membership[]): LeadershipDraft {
  return {
    assistant_player_ids: memberships
      .filter((membership) => membership.member_role === "assistant_captain")
      .map((membership) => membership.player_id),
    captain_player_id:
      memberships.find((membership) => membership.member_role === "captain")?.player_id ?? "",
  };
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [leadershipDrafts, setLeadershipDrafts] = useState<Record<string, LeadershipDraft>>({});
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPlayingVenueAddress, setEditingPlayingVenueAddress] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageTeams = mockRole === "admin";
  const filteredTeams = useMemo(() => {
    if (!selectedTeamId) {
      return teams;
    }

    return teams.filter((team) => team.id === selectedTeamId);
  }, [selectedTeamId, teams]);

  function teamSeasonForTeam(teamId: string) {
    return teamSeasons.find((teamSeason) => teamSeason.team_id === teamId) ?? null;
  }

  function membershipsForTeam(teamId: string) {
    const teamSeason = teamSeasonForTeam(teamId);
    if (!teamSeason) {
      return [];
    }

    return memberships.filter((membership) => membership.team_season_id === teamSeason.id);
  }

  function draftForTeam(teamId: string) {
    return leadershipDrafts[teamId] ?? createLeadershipDraft(membershipsForTeam(teamId));
  }

  function updateLeadershipDraft(teamId: string, draft: LeadershipDraft) {
    setLeadershipDrafts((currentDrafts) => ({
      ...currentDrafts,
      [teamId]: draft,
    }));
  }

  async function loadTeams(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const data = await fetchTeams();
      setTeams(data.teams);
      setActiveSeason(data.activeSeason);
      setTeamSeasons(data.teamSeasons);
      setMemberships(data.memberships);
      setPlayers(data.players);
      setLeadershipDrafts({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst týmy.");
      setTeams([]);
      setActiveSeason(null);
      setTeamSeasons([]);
      setMemberships([]);
      setPlayers([]);
      setLeadershipDrafts({});
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchTeams()
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setTeams(data.teams);
        setActiveSeason(data.activeSeason);
        setTeamSeasons(data.teamSeasons);
        setMemberships(data.memberships);
        setPlayers(data.players);
        setLeadershipDrafts({});
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst týmy.");
        setTeams([]);
        setActiveSeason(null);
        setTeamSeasons([]);
        setMemberships([]);
        setPlayers([]);
        setLeadershipDrafts({});
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageTeams || !form.name.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch("/api/admin/teams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name.trim(),
        playing_venue_address: form.playing_venue_address.trim(),
      }),
    });

    const body = await readJson(response);

    if (!response.ok) {
      setError(
        body.error?.includes("playing_venue_address")
          ? "Nejprve spusťte SQL soubor supabase/apply_team_venue_and_player_phone_in_dashboard.sql v Supabase SQL Editoru."
          : body.error ?? "Nepodařilo se vytvořit tým.",
      );
    } else {
      setForm(emptyForm);
      setIsCreateFormOpen(false);
      await loadTeams();
    }

    setIsSaving(false);
  }

  async function handleUpdate(teamId: string) {
    if (!editingName.trim()) {
      return;
    }

    setBusyTeamId(teamId);
    setError(null);

    const response = await fetch(`/api/admin/teams/${teamId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: editingName.trim(),
        playing_venue_address: editingPlayingVenueAddress.trim(),
      }),
    });

    const body = await readJson(response);

    if (!response.ok) {
      setError(
        body.error?.includes("playing_venue_address")
          ? "Nejprve spusťte SQL soubor supabase/apply_team_venue_and_player_phone_in_dashboard.sql v Supabase SQL Editoru."
          : body.error ?? "Nepodařilo se upravit tým.",
      );
    } else {
      setEditingTeamId(null);
      setEditingName("");
      setEditingPlayingVenueAddress("");
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  async function handleDelete(teamId: string) {
    setBusyTeamId(teamId);
    setError(null);

    const response = await fetch(`/api/admin/teams/${teamId}`, {
      method: "DELETE",
    });

    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Nepodařilo se odstranit tým.");
    } else {
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  async function handleLogoUpload(teamId: string, logo: File | undefined) {
    if (!logo) {
      return;
    }

    setBusyTeamId(teamId);
    setError(null);

    const formData = new FormData();
    formData.set("logo", logo);
    const response = await fetch(`/api/admin/teams/${teamId}/logo`, {
      method: "POST",
      body: formData,
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Nepodařilo se nahrát logo týmu.");
    } else {
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  async function handleLeadershipSave(team: Team) {
    if (!activeSeason) {
      setError("Nejdřív nastavte aktivní sezónu.");
      return;
    }

    setBusyTeamId(team.id);
    setError(null);

    const draft = draftForTeam(team.id);
    const response = await fetch(`/api/admin/teams/${team.id}/leadership`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistant_player_ids: draft.assistant_player_ids,
        captain_player_id: draft.captain_player_id || null,
        season_id: activeSeason.id,
      }),
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(
        body.error?.includes("assistant_captain")
          ? "Nejprve spusťte SQL soubor supabase/apply_assistant_captains_in_dashboard.sql v Supabase SQL Editoru."
          : body.error ?? "Nepodařilo se uložit vedení týmu.",
      );
    } else {
      await loadTeams(false);
    }

    setBusyTeamId(null);
  }

  function startEditing(team: Team) {
    setEditingTeamId(team.id);
    setEditingName(team.name);
    setEditingPlayingVenueAddress(team.playing_venue_address ?? "");
  }

  function cancelEditing() {
    setEditingTeamId(null);
    setEditingName("");
    setEditingPlayingVenueAddress("");
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Týmy</h2>
        </div>
        {canManageTeams ? (
          <button
            className="rounded-xl bg-[#EF233C] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
            onClick={() => setIsCreateFormOpen((isOpen) => !isOpen)}
            type="button"
          >
            {isCreateFormOpen ? "Zavřít vytvoření týmu" : "Vytvořit tým"}
          </button>
        ) : null}
      </header>

      {!canManageTeams ? (
        <section className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Aktuální testovací role neumožňuje správu týmů.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm">
            <label className="flex flex-col gap-1 text-sm font-medium md:max-w-sm">
              Filtrovat tým
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4FA8]"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="">Všechny týmy</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {isCreateFormOpen ? (
            <section className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm">
              <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto] xl:items-end" onSubmit={handleCreate}>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Název týmu
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F4FA8]"
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Hrací místo
                    <input
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F4FA8]"
                      placeholder="Adresa hracího místa"
                      value={form.playing_venue_address}
                      onChange={(event) =>
                        setForm({ ...form, playing_venue_address: event.target.value })
                      }
                    />
                  </label>

                  <button
                    className="rounded-xl bg-[#23364D] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1A2A3E] disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving ? "Ukládám..." : "Uložit tým"}
                  </button>
                </form>
              <p className="mt-3 text-xs text-slate-500">
                Logo lze nahrát po vytvoření týmu v seznamu.
              </p>
            </section>
          ) : null}

          <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold">Seznam týmů</h3>
              <p className="mt-1 text-sm text-slate-500">
                Vedení týmu se nastavuje pro aktivní sezónu
                {activeSeason ? ` ${activeSeason.name}.` : "."}
              </p>
            </div>

            {error ? (
              <div className="px-6 py-5 text-sm text-red-700">{error}</div>
            ) : null}

            {isLoading ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Načítám týmy...
              </div>
            ) : teams.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Nebyly nalezeny žádné týmy.
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Pro zvolený filtr nebyl nalezen žádný tým.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredTeams.map((team) => {
                  const isEditing = editingTeamId === team.id;
                  const isBusy = busyTeamId === team.id;
                  const teamMemberships = membershipsForTeam(team.id);
                  const teamDraft = draftForTeam(team.id);
                  const selectedCaptainId = teamDraft.captain_player_id;
                  const teamPlayers = teamMemberships
                    .map((membership) => players.find((player) => player.id === membership.player_id))
                    .filter((player): player is Player => Boolean(player))
                    .sort((first, second) =>
                      first.display_name.localeCompare(second.display_name, "cs"),
                    );
                  const teamSeason = teamSeasonForTeam(team.id);

                  return (
                    <article className="p-6" key={team.id}>
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1">
                            {team.logo_url ? (
                              <Image
                                alt={`Logo ${team.name}`}
                                className="h-full w-full object-contain"
                                height={64}
                                src={team.logo_url}
                                unoptimized
                                width={64}
                              />
                            ) : (
                              <span className="text-lg font-bold text-slate-500">
                                {team.name.charAt(0)}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  Název týmu
                                  <input
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-[#0F4FA8]"
                                    value={editingName}
                                    onChange={(event) => setEditingName(event.target.value)}
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  Hrací místo
                                  <input
                                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-[#0F4FA8]"
                                    placeholder="Adresa hracího místa"
                                    value={editingPlayingVenueAddress}
                                    onChange={(event) =>
                                      setEditingPlayingVenueAddress(event.target.value)
                                    }
                                  />
                                </label>
                              </div>
                            ) : (
                              <h4 className="text-lg font-semibold text-slate-950">
                                {team.name}
                              </h4>
                            )}
                            <p className="mt-1 text-sm text-slate-500">{team.slug}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              Hrací místo: {team.playing_venue_address?.trim() || "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Vytvořeno {new Date(team.created_at).toLocaleDateString("cs-CZ")}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <label
                                className={`cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0F4FA8] ${
                                  isBusy ? "pointer-events-none opacity-60" : ""
                                }`}
                              >
                                {team.logo_url ? "Změnit logo" : "Nahrát logo"}
                                <input
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  disabled={isBusy}
                                  onChange={(event) => {
                                    void handleLogoUpload(team.id, event.target.files?.[0]);
                                    event.target.value = "";
                                  }}
                                  type="file"
                                />
                              </label>

                              {isEditing ? (
                                <>
                                  <button
                                    className="rounded-xl bg-[#23364D] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                                    disabled={isBusy}
                                    onClick={() => handleUpdate(team.id)}
                                    type="button"
                                  >
                                    Uložit
                                  </button>
                                  <button
                                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                                    disabled={isBusy}
                                    onClick={cancelEditing}
                                    type="button"
                                  >
                                    Zrušit
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                                    disabled={isBusy}
                                    onClick={() => startEditing(team)}
                                    type="button"
                                  >
                                    Upravit
                                  </button>
                                  <button
                                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-red-300"
                                    disabled={isBusy}
                                    onClick={() => handleDelete(team.id)}
                                    type="button"
                                  >
                                    Odstranit
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h5 className="font-semibold text-slate-950">Vedení týmu</h5>
                              <p className="mt-1 text-xs text-slate-500">
                                Kapitán je jen jeden, zástupců může být více.
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                              {teamPlayers.length} hráčů
                            </span>
                          </div>

                          {!activeSeason ? (
                            <p className="mt-4 text-sm text-slate-500">
                              Nejdřív nastavte aktivní sezónu.
                            </p>
                          ) : !teamSeason ? (
                            <p className="mt-4 text-sm text-slate-500">
                              Tým v aktivní sezóně nemá soupisku.
                            </p>
                          ) : teamPlayers.length === 0 ? (
                            <p className="mt-4 text-sm text-slate-500">
                              Tým zatím nemá aktivní hráče.
                            </p>
                          ) : (
                            <div className="mt-4 flex flex-col gap-4">
                              <label className="flex flex-col gap-1 text-sm font-medium">
                                Kapitán
                                <select
                                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4FA8]"
                                  disabled={isBusy}
                                  value={selectedCaptainId}
                                  onChange={(event) => {
                                    const captainPlayerId = event.target.value;
                                    updateLeadershipDraft(team.id, {
                                      assistant_player_ids:
                                        teamDraft.assistant_player_ids.filter(
                                          (playerId) => playerId !== captainPlayerId,
                                        ),
                                      captain_player_id: captainPlayerId,
                                    });
                                  }}
                                >
                                  <option value="">Bez kapitána</option>
                                  {teamPlayers.map((player) => (
                                    <option key={player.id} value={player.id}>
                                      {player.display_name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div>
                                <p className="text-sm font-medium">Zástupci kapitána</p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {teamPlayers.map((player) => {
                                    const isCaptain = player.id === selectedCaptainId;
                                    const isAssistant =
                                      teamDraft.assistant_player_ids.includes(player.id);

                                    return (
                                      <label
                                        className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm ${
                                          isCaptain
                                            ? "border-slate-200 text-slate-400"
                                            : "border-slate-200 text-slate-700"
                                        }`}
                                        key={player.id}
                                      >
                                        <input
                                          checked={isAssistant}
                                          className="h-4 w-4 accent-[#0F4FA8]"
                                          disabled={isBusy || isCaptain}
                                          onChange={(event) => {
                                            const assistantPlayerIds = event.target.checked
                                              ? [
                                                  ...teamDraft.assistant_player_ids,
                                                  player.id,
                                                ]
                                              : teamDraft.assistant_player_ids.filter(
                                                  (playerId) => playerId !== player.id,
                                                );

                                            updateLeadershipDraft(team.id, {
                                              ...teamDraft,
                                              assistant_player_ids: assistantPlayerIds,
                                            });
                                          }}
                                          type="checkbox"
                                        />
                                        <span className="truncate">
                                          {player.display_name}
                                          {isCaptain ? " (kapitán)" : ""}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                                <p>
                                  Kapitán:{" "}
                                  <strong>
                                    {teamDraft.captain_player_id
                                      ? playerName(players, teamDraft.captain_player_id)
                                      : "není nastavený"}
                                  </strong>
                                </p>
                                <p className="mt-1">
                                  Zástupci:{" "}
                                  <strong>
                                    {teamDraft.assistant_player_ids.length > 0
                                      ? teamDraft.assistant_player_ids
                                          .map((playerId) => playerName(players, playerId))
                                          .join(", ")
                                      : "nejsou nastavení"}
                                  </strong>
                                </p>
                              </div>

                              <button
                                className="rounded-xl bg-[#23364D] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1A2A3E] disabled:cursor-not-allowed disabled:bg-slate-400"
                                disabled={isBusy}
                                onClick={() => handleLeadershipSave(team)}
                                type="button"
                              >
                                {isBusy ? "Ukládám..." : "Uložit vedení"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
