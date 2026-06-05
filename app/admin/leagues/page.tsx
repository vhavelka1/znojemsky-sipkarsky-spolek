"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const mockRole = "admin";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type Team = {
  id: string;
  name: string;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type League = {
  id: string;
  season_id: string;
  name: string;
  created_at: string;
};

type LeagueGroup = {
  id: string;
  league_id: string;
  name: string;
  sort_order: number;
};

type LeagueGroupTeam = {
  id: string;
  league_group_id: string;
  team_season_id: string;
};

type LeaguePayload = {
  seasons?: Season[];
  teams?: Team[];
  teamSeasons?: TeamSeason[];
  leagues?: League[];
  groups?: LeagueGroup[];
  assignments?: LeagueGroupTeam[];
  error?: string;
};

type LeagueForm = {
  name: string;
  season_id: string;
};

type GroupForm = {
  league_id: string;
  name: string;
};

type AssignmentForm = {
  league_group_id: string;
  team_season_id: string;
};

const emptyLeagueForm: LeagueForm = {
  name: "",
  season_id: "",
};

const emptyGroupForm: GroupForm = {
  league_id: "",
  name: "",
};

const emptyAssignmentForm: AssignmentForm = {
  league_group_id: "",
  team_season_id: "",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as LeaguePayload;
}

async function fetchLeagueData() {
  const response = await fetch("/api/admin/leagues");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(body.error ?? "Nepodařilo se načíst ligy.");
  }

  return {
    seasons: body.seasons ?? [],
    teams: body.teams ?? [],
    teamSeasons: body.teamSeasons ?? [],
    leagues: body.leagues ?? [],
    groups: body.groups ?? [],
    assignments: body.assignments ?? [],
  };
}

export default function AdminLeaguesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [assignments, setAssignments] = useState<LeagueGroupTeam[]>([]);
  const [leagueForm, setLeagueForm] = useState<LeagueForm>(emptyLeagueForm);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [assignmentForm, setAssignmentForm] =
    useState<AssignmentForm>(emptyAssignmentForm);
  const [isLeagueFormOpen, setIsLeagueFormOpen] = useState(false);
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [isAssignmentFormOpen, setIsAssignmentFormOpen] = useState(false);
  const [leagueFilterSeasonId, setLeagueFilterSeasonId] = useState("");
  const [leagueFilterId, setLeagueFilterId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageLeagues = mockRole === "admin";

  const seasonById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season])),
    [seasons],
  );
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamSeasonById = useMemo(
    () => new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])),
    [teamSeasons],
  );
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );

  const selectedAssignmentGroup = groupById.get(assignmentForm.league_group_id);
  const selectedAssignmentLeague = selectedAssignmentGroup
    ? leagues.find((league) => league.id === selectedAssignmentGroup.league_id)
    : undefined;

  const availableTeamSeasons = selectedAssignmentLeague
    ? teamSeasons.filter(
        (teamSeason) => teamSeason.season_id === selectedAssignmentLeague.season_id,
      )
    : teamSeasons;
  const listLeagueOptions = leagueFilterSeasonId
    ? leagues.filter((league) => league.season_id === leagueFilterSeasonId)
    : leagues;
  const visibleLeagues = listLeagueOptions.filter(
    (league) => !leagueFilterId || league.id === leagueFilterId,
  );

  async function loadLeagueData(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const loadedData = await fetchLeagueData();
      setSeasons(loadedData.seasons);
      setTeams(loadedData.teams);
      setTeamSeasons(loadedData.teamSeasons);
      setLeagues(loadedData.leagues);
      setGroups(loadedData.groups);
      setAssignments(loadedData.assignments);

      setLeagueForm((currentForm) => ({
        name: currentForm.name,
        season_id:
          currentForm.season_id ||
          loadedData.seasons.find((season) => season.is_active)?.id ||
          loadedData.seasons[0]?.id ||
          "",
      }));
      setGroupForm((currentForm) => ({
        league_id: currentForm.league_id || loadedData.leagues[0]?.id || "",
        name: currentForm.name,
      }));
      setAssignmentForm((currentForm) => ({
        league_group_id: currentForm.league_group_id || loadedData.groups[0]?.id || "",
        team_season_id:
          currentForm.team_season_id || loadedData.teamSeasons[0]?.id || "",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst ligy.");
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchLeagueData()
      .then((loadedData) => {
        if (!isMounted) {
          return;
        }

        setSeasons(loadedData.seasons);
        setTeams(loadedData.teams);
        setTeamSeasons(loadedData.teamSeasons);
        setLeagues(loadedData.leagues);
        setGroups(loadedData.groups);
        setAssignments(loadedData.assignments);
        setLeagueForm({
          name: "",
          season_id:
            loadedData.seasons.find((season) => season.is_active)?.id ||
            loadedData.seasons[0]?.id ||
            "",
        });
        setGroupForm({
          league_id: loadedData.leagues[0]?.id || "",
          name: "",
        });
        setAssignmentForm({
          league_group_id: loadedData.groups[0]?.id || "",
          team_season_id: loadedData.teamSeasons[0]?.id || "",
        });
        setLeagueFilterSeasonId(
          loadedData.seasons.find((season) => season.is_active)?.id ||
            loadedData.seasons[0]?.id ||
            "",
        );
        setLeagueFilterId("");
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Nepodařilo se načíst ligy.");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitAdminAction(payload: Record<string, string>) {
    const response = await fetch("/api/admin/leagues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    await readJson(response);

    if (!response.ok) {
      throw new Error("Akci se nepodařilo uložit.");
    }
  }

  async function handleCreateLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageLeagues || !leagueForm.name.trim() || !leagueForm.season_id) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitAdminAction({
        action: "create_league",
        name: leagueForm.name.trim(),
        season_id: leagueForm.season_id,
      });
      setLeagueForm({ ...leagueForm, name: "" });
      setIsLeagueFormOpen(false);
      await loadLeagueData(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ligu se nepodařilo vytvořit.");
    }

    setIsSaving(false);
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageLeagues || !groupForm.name.trim() || !groupForm.league_id) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitAdminAction({
        action: "create_group",
        name: groupForm.name.trim(),
        league_id: groupForm.league_id,
      });
      setGroupForm({ ...groupForm, name: "" });
      setIsGroupFormOpen(false);
      await loadLeagueData(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Skupinu se nepodařilo vytvořit.",
      );
    }

    setIsSaving(false);
  }

  async function handleAssignTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageLeagues || !assignmentForm.league_group_id || !assignmentForm.team_season_id) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitAdminAction({
        action: "assign_team",
        league_group_id: assignmentForm.league_group_id,
        team_season_id: assignmentForm.team_season_id,
      });
      setIsAssignmentFormOpen(false);
      await loadLeagueData(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Tým se nepodařilo přiřadit.",
      );
    }

    setIsSaving(false);
  }

  function getTeamSeasonLabel(teamSeasonId: string) {
    const teamSeason = teamSeasonById.get(teamSeasonId);
    if (!teamSeason) {
      return "Neznámý tým";
    }

    return teamSeason.display_name || teamById.get(teamSeason.team_id)?.name || "Neznámý tým";
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Ligy</h2>
        </div>
        {canManageLeagues ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-[#EF233C] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              onClick={() => setIsLeagueFormOpen(true)}
              type="button"
            >
              Vytvořit ligu
            </button>
            <button
              className="rounded-xl bg-[#EF233C] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              onClick={() => setIsGroupFormOpen(true)}
              type="button"
            >
              Vytvořit skupinu
            </button>
            <button
              className="rounded-xl bg-[#EF233C] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              onClick={() => setIsAssignmentFormOpen(true)}
              type="button"
            >
              Přiřadit tým
            </button>
          </div>
        ) : null}
      </header>

      {!canManageLeagues ? (
        <section className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Aktuální testovací role neumožňuje správu lig.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Filtrovat podle sezóny
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={leagueFilterSeasonId}
                  onChange={(event) => {
                    setLeagueFilterSeasonId(event.target.value);
                    setLeagueFilterId("");
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
              <label className="flex flex-col gap-1 text-sm font-medium">
                Filtrovat podle ligy
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={leagueFilterId}
                  onChange={(event) => setLeagueFilterId(event.target.value)}
                >
                  <option value="">Všechny ligy</option>
                  {listLeagueOptions.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {isLeagueFormOpen ? (
            <section className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold">Vytvořit ligu</h3>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setLeagueForm({ ...leagueForm, name: "" });
                        setIsLeagueFormOpen(false);
                      }}
                      type="button"
                    >
                      Zrušit
                    </button>
                  </div>

                  <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreateLeague}>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Název ligy
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={leagueForm.name}
                        onChange={(event) =>
                          setLeagueForm({ ...leagueForm, name: event.target.value })
                        }
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Sezóna
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={leagueForm.season_id}
                        onChange={(event) =>
                          setLeagueForm({ ...leagueForm, season_id: event.target.value })
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

                    <button
                      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSaving || seasons.length === 0}
                      type="submit"
                    >
                      {isSaving ? "Ukládám..." : "Uložit ligu"}
                    </button>
                  </form>
            </section>
          ) : null}

          {isGroupFormOpen ? (
            <section className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold">Vytvořit skupinu</h3>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setGroupForm({ ...groupForm, name: "" });
                        setIsGroupFormOpen(false);
                      }}
                      type="button"
                    >
                      Zrušit
                    </button>
                  </div>

                  <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreateGroup}>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Liga
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={groupForm.league_id}
                        onChange={(event) =>
                          setGroupForm({ ...groupForm, league_id: event.target.value })
                        }
                      >
                        <option value="">Vyberte ligu</option>
                        {leagues.map((league) => (
                          <option key={league.id} value={league.id}>
                            {league.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Název skupiny
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        placeholder="Skupina A"
                        required
                        value={groupForm.name}
                        onChange={(event) =>
                          setGroupForm({ ...groupForm, name: event.target.value })
                        }
                      />
                    </label>

                    <button
                      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSaving || leagues.length === 0}
                      type="submit"
                    >
                      {isSaving ? "Ukládám..." : "Uložit skupinu"}
                    </button>
                  </form>
            </section>
          ) : null}

          {isAssignmentFormOpen ? (
            <section className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold">Přiřadit tým</h3>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setIsAssignmentFormOpen(false)}
                      type="button"
                    >
                      Zrušit
                    </button>
                  </div>

                  <form className="mt-5 flex flex-col gap-4" onSubmit={handleAssignTeam}>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Skupina
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={assignmentForm.league_group_id}
                        onChange={(event) =>
                          setAssignmentForm({
                            league_group_id: event.target.value,
                            team_season_id: "",
                          })
                        }
                      >
                        <option value="">Vyberte skupinu</option>
                        {groups.map((group) => {
                          const league = leagues.find((item) => item.id === group.league_id);
                          return (
                            <option key={group.id} value={group.id}>
                              {league?.name || "Neznámá liga"} - {group.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Tým v sezóně
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={assignmentForm.team_season_id}
                        onChange={(event) =>
                          setAssignmentForm({
                            ...assignmentForm,
                            team_season_id: event.target.value,
                          })
                        }
                      >
                        <option value="">Vyberte tým</option>
                        {availableTeamSeasons.map((teamSeason) => (
                          <option key={teamSeason.id} value={teamSeason.id}>
                            {getTeamSeasonLabel(teamSeason.id)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSaving || groups.length === 0 || availableTeamSeasons.length === 0}
                      type="submit"
                    >
                      {isSaving ? "Ukládám..." : "Uložit přiřazení"}
                    </button>
                  </form>
            </section>
          ) : null}

          <section className="rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold">Seznam lig</h3>
            </div>

            {error ? <div className="px-6 py-5 text-sm text-red-700">{error}</div> : null}

            {isLoading ? (
              <div className="px-6 py-5 text-sm text-slate-500">Načítám ligy...</div>
            ) : leagues.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Nebyly nalezeny žádné ligy.
              </div>
            ) : visibleLeagues.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Pro zvolený filtr nebyla nalezena žádná liga.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {visibleLeagues.map((league) => {
                  const leagueGroups = groups.filter((group) => group.league_id === league.id);

                  return (
                    <article className="px-6 py-5" key={league.id}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-base font-semibold">{league.name}</h4>
                          <p className="text-sm text-slate-500">
                            {seasonById.get(league.season_id)?.name || "Neznámá sezóna"}
                          </p>
                        </div>
                      </div>

                      {leagueGroups.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">
                          Liga zatím nemá žádné skupiny.
                        </p>
                      ) : (
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          {leagueGroups.map((group) => {
                            const groupAssignments = assignments.filter(
                              (assignment) => assignment.league_group_id === group.id,
                            );

                            return (
                              <div
                                className="rounded-lg border border-slate-200 p-4"
                                key={group.id}
                              >
                                <h5 className="font-semibold">{group.name}</h5>
                                {groupAssignments.length === 0 ? (
                                  <p className="mt-3 text-sm text-slate-500">
                                    Skupina zatím nemá přiřazené týmy.
                                  </p>
                                ) : (
                                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                    {groupAssignments.map((assignment) => (
                                      <li key={assignment.id}>
                                        {getTeamSeasonLabel(assignment.team_season_id)}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
