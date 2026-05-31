"use client";

import { useEffect, useMemo, useState } from "react";

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

type TableFilters = {
  season_id: string;
  league_id: string;
  group_id: string;
};

type StandingRow = {
  teamSeasonId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
};

const emptyFilters: TableFilters = {
  season_id: "",
  league_id: "",
  group_id: "",
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as MatchPayload;
}

async function fetchTableData() {
  const response = await fetch("/api/admin/matches");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(body.error ?? "Nepodařilo se načíst ligové tabulky.");
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

function compareStandingRows(first: StandingRow, second: StandingRow) {
  const pointsDiff = second.points - first.points;
  if (pointsDiff !== 0) {
    return pointsDiff;
  }

  const firstScoreDiff = first.scoreFor - first.scoreAgainst;
  const secondScoreDiff = second.scoreFor - second.scoreAgainst;
  const scoreDiff = secondScoreDiff - firstScoreDiff;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const scoreForDiff = second.scoreFor - first.scoreFor;
  if (scoreForDiff !== 0) {
    return scoreForDiff;
  }

  return first.teamName.localeCompare(second.teamName, "cs");
}

export default function AdminTablesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [assignments, setAssignments] = useState<LeagueGroupTeam[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [filters, setFilters] = useState<TableFilters>(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamSeasonById = useMemo(
    () => new Map(teamSeasons.map((teamSeason) => [teamSeason.id, teamSeason])),
    [teamSeasons],
  );
  const resultByMatchId = useMemo(
    () => new Map(results.map((result) => [result.match_id, result])),
    [results],
  );

  const filteredLeagues = leagues.filter(
    (league) => league.season_id === filters.season_id,
  );
  const filteredGroups = groups.filter((group) => group.league_id === filters.league_id);

  const standings = useMemo(() => {
    if (!filters.season_id || !filters.league_id || !filters.group_id) {
      return [];
    }

    const rows = new Map<string, StandingRow>();
    const groupTeamIds = new Set(
      assignments
        .filter((assignment) => assignment.league_group_id === filters.group_id)
        .map((assignment) => assignment.team_season_id),
    );

    groupTeamIds.forEach((teamSeasonId) => {
      const teamSeason = teamSeasonById.get(teamSeasonId);
      const teamName =
        teamSeason?.display_name ||
        (teamSeason ? teamById.get(teamSeason.team_id)?.name : null) ||
        "Neznámý tým";

      rows.set(teamSeasonId, {
        teamSeasonId,
        teamName,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        points: 0,
      });
    });

    matches
      .filter(
        (match) =>
          (match.status === "played" || match.status === "confirmed") &&
          match.season_id === filters.season_id &&
          match.league_id === filters.league_id &&
          match.group_id === filters.group_id,
      )
      .forEach((match) => {
        const result = resultByMatchId.get(match.id);
        const homeRow = rows.get(match.home_team_id);
        const awayRow = rows.get(match.away_team_id);

        if (!result || !homeRow || !awayRow) {
          return;
        }

        homeRow.played += 1;
        awayRow.played += 1;
        homeRow.scoreFor += result.home_points;
        homeRow.scoreAgainst += result.away_points;
        awayRow.scoreFor += result.away_points;
        awayRow.scoreAgainst += result.home_points;

        if (result.home_points > result.away_points) {
          homeRow.wins += 1;
          homeRow.points += 2;
          awayRow.losses += 1;
        } else if (result.home_points < result.away_points) {
          awayRow.wins += 1;
          awayRow.points += 2;
          homeRow.losses += 1;
        } else {
          homeRow.draws += 1;
          awayRow.draws += 1;
          homeRow.points += 1;
          awayRow.points += 1;
        }
      });

    return Array.from(rows.values()).sort(compareStandingRows);
  }, [
    assignments,
    filters.group_id,
    filters.league_id,
    filters.season_id,
    matches,
    resultByMatchId,
    teamById,
    teamSeasonById,
  ]);

  useEffect(() => {
    let isMounted = true;

    fetchTableData()
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

        setFilters({
          season_id: defaultSeasonId,
          league_id: defaultLeague?.id || "",
          group_id: defaultGroup?.id || "",
        });
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Nepodařilo se načíst ligové tabulky.",
        );
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium text-slate-500">Administrace</p>
        <h2 className="mt-2 text-3xl font-bold">Ligové tabulky</h2>
      </header>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Sezóna
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
              value={filters.season_id}
              onChange={(event) => {
                const seasonId = event.target.value;
                const nextLeague = leagues.find((league) => league.season_id === seasonId);
                const nextGroup = groups.find(
                  (group) => group.league_id === nextLeague?.id,
                );

                setFilters({
                  season_id: seasonId,
                  league_id: nextLeague?.id || "",
                  group_id: nextGroup?.id || "",
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
              value={filters.league_id}
              onChange={(event) => {
                const leagueId = event.target.value;
                const nextGroup = groups.find((group) => group.league_id === leagueId);

                setFilters({
                  ...filters,
                  league_id: leagueId,
                  group_id: nextGroup?.id || "",
                });
              }}
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
              value={filters.group_id}
              onChange={(event) =>
                setFilters({ ...filters, group_id: event.target.value })
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
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold">Tabulka</h3>
        </div>

        {error ? <div className="px-6 py-5 text-sm text-red-700">{error}</div> : null}

        {isLoading ? (
          <div className="px-6 py-5 text-sm text-slate-500">
            Načítám ligovou tabulku...
          </div>
        ) : standings.length === 0 ? (
          <div className="px-6 py-5 text-sm text-slate-500">
            Pro vybranou skupinu nejsou k dispozici žádné týmy ani odehrané zápasy.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Pořadí</th>
                  <th className="px-4 py-3">Tým</th>
                  <th className="px-4 py-3 text-right">Zápasy</th>
                  <th className="px-4 py-3 text-right">Výhry</th>
                  <th className="px-4 py-3 text-right">Remízy</th>
                  <th className="px-4 py-3 text-right">Prohry</th>
                  <th className="px-4 py-3 text-right">Skóre</th>
                  <th className="px-4 py-3 text-right">Body</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {standings.map((row, index) => (
                  <tr key={row.teamSeasonId}>
                    <td className="px-4 py-3 font-semibold">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.teamName}</td>
                    <td className="px-4 py-3 text-right">{row.played}</td>
                    <td className="px-4 py-3 text-right">{row.wins}</td>
                    <td className="px-4 py-3 text-right">{row.draws}</td>
                    <td className="px-4 py-3 text-right">{row.losses}</td>
                    <td className="px-4 py-3 text-right">
                      {row.scoreFor}:{row.scoreAgainst}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
