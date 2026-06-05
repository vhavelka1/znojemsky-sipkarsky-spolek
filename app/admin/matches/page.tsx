"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const mockRole = "admin";

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
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
  sort_order: number;
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

type LeagueGroupTeam = {
  id: string;
  league_group_id: string;
  team_season_id: string;
};

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";

type Match = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  played_at: string | null;
  status: MatchStatus;
  created_at: string;
};

type MatchResult = {
  id: string;
  match_id: string;
  home_points: number;
  away_points: number;
};

type MatchPayload = {
  seasons?: Season[];
  leagues?: League[];
  groups?: LeagueGroup[];
  teams?: Team[];
  teamSeasons?: TeamSeason[];
  assignments?: LeagueGroupTeam[];
  matches?: Match[];
  results?: MatchResult[];
  error?: string;
};

type MatchForm = {
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
};

const emptyMatchForm: MatchForm = {
  season_id: "",
  league_id: "",
  group_id: "",
  home_team_id: "",
  away_team_id: "",
  scheduled_at: "",
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: "naplánováno",
  played: "odehráno",
  awaiting_confirmation: "čeká na potvrzení",
  confirmed: "potvrzeno",
  cancelled: "zrušeno",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as MatchPayload;
}

async function fetchMatchData() {
  const response = await fetch("/api/admin/matches");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(body.error ?? "Nepodařilo se načíst zápasy.");
  }

  return {
    seasons: body.seasons ?? [],
    leagues: body.leagues ?? [],
    groups: body.groups ?? [],
    teams: body.teams ?? [],
    teamSeasons: body.teamSeasons ?? [],
    assignments: body.assignments ?? [],
    matches: body.matches ?? [],
    results: body.results ?? [],
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminMatchesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [assignments, setAssignments] = useState<LeagueGroupTeam[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [matchForm, setMatchForm] = useState<MatchForm>(emptyMatchForm);
  const [isMatchFormOpen, setIsMatchFormOpen] = useState(false);
  const [matchFilterSeasonId, setMatchFilterSeasonId] = useState("");
  const [matchFilterLeagueId, setMatchFilterLeagueId] = useState("");
  const [matchFilterGroupId, setMatchFilterGroupId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingTeams, setIsPreparingTeams] = useState(false);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageMatches = mockRole === "admin";

  const seasonById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season])),
    [seasons],
  );
  const leagueById = useMemo(
    () => new Map(leagues.map((league) => [league.id, league])),
    [leagues],
  );
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamSeasonById = useMemo(
    () => new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])),
    [teamSeasons],
  );
  const resultByMatchId = useMemo(
    () => new Map(results.map((result) => [result.match_id, result])),
    [results],
  );
  const listLeagueOptions = matchFilterSeasonId
    ? leagues.filter((league) => league.season_id === matchFilterSeasonId)
    : leagues;
  const listGroupOptions = matchFilterLeagueId
    ? groups.filter((group) => group.league_id === matchFilterLeagueId)
    : groups;
  const visibleMatches = matches.filter((match) => {
    if (matchFilterSeasonId && match.season_id !== matchFilterSeasonId) return false;
    if (matchFilterLeagueId && match.league_id !== matchFilterLeagueId) return false;
    if (matchFilterGroupId && match.group_id !== matchFilterGroupId) return false;
    return true;
  });

  const filteredLeagues = leagues.filter(
    (league) => league.season_id === matchForm.season_id,
  );
  const filteredGroups = groups.filter(
    (group) => group.league_id === matchForm.league_id,
  );
  const selectedGroupAssignments = assignments.filter(
    (assignment) => assignment.league_group_id === matchForm.group_id,
  );
  const availableTeamSeasons = selectedGroupAssignments
    .map((assignment) => teamSeasonById.get(assignment.team_season_id))
    .filter((teamSeason): teamSeason is TeamSeason => Boolean(teamSeason));
  const canPrepareTeams =
    canManageMatches &&
    Boolean(matchForm.season_id) &&
    Boolean(matchForm.league_id) &&
    teams.length > 0 &&
    (filteredGroups.length === 0 || availableTeamSeasons.length === 0);

  async function loadMatchData(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const loadedData = await fetchMatchData();
      setSeasons(loadedData.seasons);
      setLeagues(loadedData.leagues);
      setGroups(loadedData.groups);
      setTeams(loadedData.teams);
      setTeamSeasons(loadedData.teamSeasons);
      setAssignments(loadedData.assignments);
      setMatches(loadedData.matches);
      setResults(loadedData.results);

      const defaultSeasonId =
        loadedData.seasons.find((season) => season.is_active)?.id ||
        loadedData.seasons[0]?.id ||
        "";
      const defaultLeague =
        loadedData.leagues.find((league) => league.season_id === defaultSeasonId) ||
        loadedData.leagues[0];
      const defaultGroup = loadedData.groups.find(
        (group) => group.league_id === defaultLeague?.id,
      );

      setMatchForm((currentForm) => ({
        ...currentForm,
        season_id: currentForm.season_id || defaultSeasonId,
        league_id: currentForm.league_id || defaultLeague?.id || "",
        group_id: currentForm.group_id || defaultGroup?.id || "",
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Nepodařilo se načíst zápasy.",
      );
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    fetchMatchData()
      .then((loadedData) => {
        if (!isMounted) {
          return;
        }

        setSeasons(loadedData.seasons);
        setLeagues(loadedData.leagues);
        setGroups(loadedData.groups);
        setTeams(loadedData.teams);
        setTeamSeasons(loadedData.teamSeasons);
        setAssignments(loadedData.assignments);
        setMatches(loadedData.matches);
        setResults(loadedData.results);

        const defaultSeasonId =
          loadedData.seasons.find((season) => season.is_active)?.id ||
          loadedData.seasons[0]?.id ||
          "";
        const defaultLeague =
          loadedData.leagues.find((league) => league.season_id === defaultSeasonId) ||
          loadedData.leagues[0];
        const defaultGroup = loadedData.groups.find(
          (group) => group.league_id === defaultLeague?.id,
        );

        setMatchForm({
          ...emptyMatchForm,
          season_id: defaultSeasonId,
          league_id: defaultLeague?.id || "",
          group_id: defaultGroup?.id || "",
        });
        setMatchFilterSeasonId(defaultSeasonId);
        setMatchFilterLeagueId("");
        setMatchFilterGroupId("");
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Nepodařilo se načíst zápasy.",
        );
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function getTeamSeasonLabel(teamSeasonId: string) {
    const teamSeason = teamSeasonById.get(teamSeasonId);
    if (!teamSeason) {
      return "Neznámý tým";
    }

    return teamSeason.display_name || teamById.get(teamSeason.team_id)?.name || "Neznámý tým";
  }

  async function submitAdminAction(payload: Record<string, string>) {
    const response = await fetch("/api/admin/matches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(body.error ?? "Akci se nepodařilo uložit.");
    }
  }

  async function handlePrepareTeams() {
    if (!canPrepareTeams) {
      return;
    }

    setIsPreparingTeams(true);
    setError(null);

    try {
      await submitAdminAction({
        action: "prepare_match_setup",
        season_id: matchForm.season_id,
        league_id: matchForm.league_id,
      });
      await loadMatchData(false);
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Týmy se nepodařilo připravit pro zápasy.",
      );
    }

    setIsPreparingTeams(false);
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canManageMatches ||
      !matchForm.season_id ||
      !matchForm.league_id ||
      !matchForm.group_id ||
      !matchForm.home_team_id ||
      !matchForm.away_team_id ||
      !matchForm.scheduled_at
    ) {
      return;
    }

    if (matchForm.home_team_id === matchForm.away_team_id) {
      setError("Tým nemůže hrát sám proti sobě.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitAdminAction({
        action: "create_match",
        ...matchForm,
        scheduled_at: new Date(matchForm.scheduled_at).toISOString(),
      });
      setMatchForm({ ...matchForm, home_team_id: "", away_team_id: "", scheduled_at: "" });
      setIsMatchFormOpen(false);
      await loadMatchData(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Zápas se nepodařilo vytvořit.",
      );
    }

    setIsSaving(false);
  }

  async function handleDeleteMatch(matchId: string) {
    if (!window.confirm("Opravdu chcete smazat tento zápas?")) {
      return;
    }

    setDeletingMatchId(matchId);
    setError(null);
    const response = await fetch(`/api/admin/matches/${matchId}`, {
      method: "DELETE",
    });
    const body = await readJson(response);

    if (!response.ok) {
      setError(body.error ?? "Zápas se nepodařilo smazat.");
    } else {
      await loadMatchData(false);
    }

    setDeletingMatchId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administrace</p>
          <h2 className="mt-2 text-3xl font-bold">Zápasy</h2>
        </div>
        {canManageMatches ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-[#EF233C] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#C91D32]"
              onClick={() => setIsMatchFormOpen(true)}
              type="button"
            >
              Vytvořit zápas
            </button>
          </div>
        ) : null}
      </header>

      {!canManageMatches ? (
        <section className="rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Aktuální testovací role neumožňuje správu zápasů.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Sezóna
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={matchFilterSeasonId}
                  onChange={(event) => {
                    setMatchFilterSeasonId(event.target.value);
                    setMatchFilterLeagueId("");
                    setMatchFilterGroupId("");
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
                Liga
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={matchFilterLeagueId}
                  onChange={(event) => {
                    setMatchFilterLeagueId(event.target.value);
                    setMatchFilterGroupId("");
                  }}
                >
                  <option value="">Všechny ligy</option>
                  {listLeagueOptions.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Skupina
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  value={matchFilterGroupId}
                  onChange={(event) => setMatchFilterGroupId(event.target.value)}
                >
                  <option value="">Všechny skupiny</option>
                  {listGroupOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {isMatchFormOpen ? (
            <section className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold">Vytvořit zápas</h3>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setIsMatchFormOpen(false)}
                      type="button"
                    >
                      Zrušit
                    </button>
                  </div>

                  <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreateMatch}>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Sezóna
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                        required
                        value={matchForm.season_id}
                        onChange={(event) => {
                          const seasonId = event.target.value;
                          setMatchForm({
                            ...matchForm,
                            season_id: seasonId,
                            league_id: "",
                            group_id: "",
                            home_team_id: "",
                            away_team_id: "",
                          });
                        }}
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
                  Liga
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={matchForm.league_id}
                    onChange={(event) =>
                      setMatchForm({
                        ...matchForm,
                        league_id: event.target.value,
                        group_id: "",
                        home_team_id: "",
                        away_team_id: "",
                      })
                    }
                  >
                    <option value="">Vyberte ligu</option>
                    {filteredLeagues.map((league) => (
                      <option key={league.id} value={league.id}>
                        {league.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Skupina
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={matchForm.group_id}
                    onChange={(event) =>
                      setMatchForm({
                        ...matchForm,
                        group_id: event.target.value,
                        home_team_id: "",
                        away_team_id: "",
                      })
                    }
                  >
                    <option value="">Vyberte skupinu</option>
                    {filteredGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Domácí tým
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={matchForm.home_team_id}
                    onChange={(event) =>
                      setMatchForm({ ...matchForm, home_team_id: event.target.value })
                    }
                  >
                    <option value="">Vyberte domácí tým</option>
                    {availableTeamSeasons.map((teamSeason) => (
                      <option key={teamSeason.id} value={teamSeason.id}>
                        {getTeamSeasonLabel(teamSeason.id)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Hostující tým
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    value={matchForm.away_team_id}
                    onChange={(event) =>
                      setMatchForm({ ...matchForm, away_team_id: event.target.value })
                    }
                  >
                    <option value="">Vyberte hostující tým</option>
                    {availableTeamSeasons.map((teamSeason) => (
                      <option
                        disabled={teamSeason.id === matchForm.home_team_id}
                        key={teamSeason.id}
                        value={teamSeason.id}
                      >
                        {getTeamSeasonLabel(teamSeason.id)}
                      </option>
                    ))}
                  </select>
                </label>

                {canPrepareTeams ? (
                  <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-soft-blue)] p-4 text-sm text-slate-700">
                    <p>
                      Existující týmy ještě nejsou přiřazené do sezóny a skupiny této
                      ligy.
                    </p>
                    <button
                      className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isPreparingTeams}
                      onClick={handlePrepareTeams}
                      type="button"
                    >
                      {isPreparingTeams ? "Připravuji..." : "Připravit týmy pro zápasy"}
                    </button>
                  </div>
                ) : null}

                {availableTeamSeasons.length === 1 ? (
                  <p className="text-sm text-slate-500">
                    Pro vytvoření zápasu je potřeba přidat ještě druhý tým.
                  </p>
                ) : null}

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Datum a čas
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                    required
                    type="datetime-local"
                    value={matchForm.scheduled_at}
                    onChange={(event) =>
                      setMatchForm({ ...matchForm, scheduled_at: event.target.value })
                    }
                  />
                </label>

                    <button
                      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSaving || availableTeamSeasons.length < 2}
                      type="submit"
                    >
                      {isSaving ? "Ukládám..." : "Uložit zápas"}
                    </button>
                  </form>
            </section>
          ) : null}

          <section className="rounded-lg bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold">Seznam zápasů</h3>
            </div>

            {error ? <div className="px-6 py-5 text-sm text-red-700">{error}</div> : null}

            {isLoading ? (
              <div className="px-6 py-5 text-sm text-slate-500">Načítám zápasy...</div>
            ) : matches.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Nebyly nalezeny žádné zápasy.
              </div>
            ) : visibleMatches.length === 0 ? (
              <div className="px-6 py-5 text-sm text-slate-500">
                Pro zvolený filtr nebyl nalezen žádný zápas.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {visibleMatches.map((match) => {
                  const result = resultByMatchId.get(match.id);

                  return (
                    <article className="px-6 py-5" key={match.id}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-500">
                            {seasonById.get(match.season_id)?.name || "Neznámá sezóna"} /{" "}
                            {leagueById.get(match.league_id)?.name || "Neznámá liga"} /{" "}
                            {groupById.get(match.group_id)?.name || "Neznámá skupina"}
                          </p>
                          <h4 className="mt-1 text-base font-semibold">
                            {getTeamSeasonLabel(match.home_team_id)} vs.{" "}
                            {getTeamSeasonLabel(match.away_team_id)}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatDateTime(match.scheduled_at)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              href={`/admin/matches/${match.id}`}
                            >
                              Otevřít zápis
                            </Link>
                            <Link
                              className="inline-flex rounded-md bg-[#061A3A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0B2F6B]"
                              href={`/admin/matches/${match.id}/scoreboard`}
                            >
                              Počítadlo
                            </Link>
                            <button
                              className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingMatchId === match.id}
                              onClick={() => void handleDeleteMatch(match.id)}
                              type="button"
                            >
                              {deletingMatchId === match.id ? "Mažu..." : "Smazat zápas"}
                            </button>
                          </div>
                        </div>

                        <div className="text-left lg:text-right">
                          <span className="inline-flex rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {statusLabels[match.status]}
                          </span>
                          {result ? (
                            <p className="mt-2 text-2xl font-bold">
                              {result.home_points}:{result.away_points}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500">Výsledek nezadán</p>
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
