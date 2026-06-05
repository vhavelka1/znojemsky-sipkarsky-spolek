"use client";

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
};

type Membership = {
  id: string;
  season_id: string;
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
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

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T;
}

async function fetchRosterData() {
  const [membershipResponse, leagueResponse] = await Promise.all([
    fetch("/api/admin/memberships"),
    fetch("/api/admin/leagues"),
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

function memberRoleLabel(role: Membership["member_role"]) {
  if (role === "captain") {
    return "Kapitán";
  }

  if (role === "assistant_captain") {
    return "Zástupce kapitána";
  }

  return "Hráč";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
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

  useEffect(() => {
    let isMounted = true;

    fetchRosterData()
      .then((data) => {
        if (!isMounted) return;

        setPlayers(data.players);
        setTeams(data.teams);
        setSeasons(data.seasons);
        setTeamSeasons(data.teamSeasons);
        setMemberships(data.memberships);
        setLeagues(data.leagues);
        setGroups(data.groups);
        setAssignments(data.assignments);

        const activeSeason = data.seasons.find((season) => season.is_active) ?? data.seasons[0];
        const seasonId = activeSeason?.id ?? "";
        const firstLeague = data.leagues.find((league) => league.season_id === seasonId);
        setSelectedSeasonId(seasonId);
        setSelectedLeagueId(firstLeague?.id ?? "");
        setSelectedTeamSeasonId("");
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;

        setError(loadError instanceof Error ? loadError.message : "Soupisky se nepodařilo načíst.");
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
        <h2 className="mt-2 text-3xl font-bold">Soupisky</h2>
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
                setSelectedSeasonId(seasonId);
                setSelectedLeagueId(leagues.find((league) => league.season_id === seasonId)?.id ?? "");
                setSelectedTeamSeasonId("");
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
              onChange={(event) => setSelectedTeamSeasonId(event.target.value)}
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
                  <h3 className="text-lg font-semibold">{getTeamSeasonLabel(teamSeason)}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {groupNames.length > 0 ? groupNames.join(", ") : "Bez přiřazené skupiny"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Aktivní: {teamMemberships.filter((membership) => !membership.left_on).length}
                </span>
              </div>

              {teamMemberships.length === 0 ? (
                <div className="px-6 py-5 text-sm text-slate-500">
                  Tým nemá pro zvolené období žádné členy.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Hráč</th>
                        <th className="px-6 py-3 font-semibold">Role</th>
                        <th className="px-6 py-3 font-semibold">Od</th>
                        <th className="px-6 py-3 font-semibold">Do</th>
                        <th className="px-6 py-3 font-semibold">Stav</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {teamMemberships.map((membership) => (
                        <tr key={membership.id}>
                          <td className="px-6 py-4 font-medium">
                            {playerById.get(membership.player_id)?.display_name ?? "Neznámý hráč"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {memberRoleLabel(membership.member_role)}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {formatDate(membership.joined_on)}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {formatDate(membership.left_on)}
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
                        </tr>
                      ))}
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
