import { NextRequest, NextResponse } from "next/server";
import { calculateUsefulnessScore } from "@/lib/playerUsefulness";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

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
  slug: string;
  logo_url?: string | null;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type LeagueGroupTeam = {
  league_group_id: string;
  team_season_id: string;
};

type Membership = {
  season_id: string;
  team_season_id: string;
  player_id: string;
  left_on: string | null;
};

type Player = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

type MatchStatus = "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";

type Match = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  status: MatchStatus;
};

type MatchGame = {
  id: string;
  match_id: string;
  game_type: "singles" | "doubles" | "cricket" | "tiebreak_701";
  home_legs: number;
  away_legs: number;
  winner_side: "home" | "away" | null;
};

type MatchGamePlayer = {
  match_game_id: string;
  side: "home" | "away";
  player_id: string;
};

type AchievementType = "score_95_plus" | "score_133_plus" | "score_171_plus" | "checkout_100_plus";

type MatchAchievement = {
  player_id: string;
  achievement_type: AchievementType;
  achievement_count: number;
};

type ImportedPlayerStat = {
  player_id: string;
  team_season_id: string | null;
  played_matches: number;
  won_matches: number;
  lost_matches: number;
  played_legs: number;
  won_legs: number;
  lost_legs: number;
  score_95_plus: number;
  score_133_plus: number;
  score_171_plus: number;
  checkout_100_plus: number;
};

type PublicTeam = {
  teamSeasonId: string;
  name: string;
  logoUrl: string | null;
};

type PlayerStat = {
  playerId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  teamSeasonId: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  playedMatches: number;
  wonMatches: number;
  lostMatches: number;
  winPercentage: number;
  wonLegs: number;
  lostLegs: number;
  score95Plus: number;
  score133Plus: number;
  score171Plus: number;
  checkout100Plus: number;
  usefulnessScore: number;
};

const bundledLogoUrls: Record<string, string> = {
  "aligatori-kucharovice": "/team-logos/aligatori.png",
  "beny-club": "/team-logos/beny-club.png",
  "dc-dikobrazi-olbramovice": "/team-logos/dc-dikobrazi-olbramovice.png",
  "dc-draci-resice": "/team-logos/dc-draci-resice.png",
  "dc-fretky-rosice": "/team-logos/dc-fretky-rosice.png",
  "dc-jezci-moravsky-krumlov": "/team-logos/dc-jezci-mor-krumlov.png",
  "dc-kohouti-mackovice": "/team-logos/dc-kohouti-mackovice.png",
  "dc-krakeni-hrusovany-nad-jevisovkou": "/team-logos/dc-krakeni.png",
  "dc-medvedi-chvalovice": "/team-logos/dc-medvedi-chvalovice.png",
  "dc-orli": "/team-logos/dc-orli.png",
  "dc-rafani-hodonice": "/team-logos/dc-rafani-hodonice.png",
  "dc-rytiri": "/team-logos/dc-rytiri.png",
  "dc-sklipkani-sanov": "/team-logos/dc-sklipkani-sanov.png",
  "dc-sloni-ivancice": "/team-logos/dc-sloni-ivancice.png",
  "dc-srsni-vemyslice": "/team-logos/dc-srsni-vemyslice.png",
  "dc-vlci": "/team-logos/dc-vlci.png",
  "loofci-moravske-budejovice": "/team-logos/loofci-mor-budejovice.png",
  "lukovsti-dravci": "/team-logos/lukovsti-dravci.png",
  "octopus-kridluvky": "/team-logos/oktopus-kridluvky.png",
};

function isFinishedMatch(match: Match) {
  return match.status === "played" || match.status === "confirmed" || match.status === "awaiting_confirmation";
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createEmptyStat(player: Player, membership: Membership | null, team: PublicTeam | null): PlayerStat {
  return {
    playerId: player.id,
    displayName: player.display_name,
    firstName: player.first_name,
    lastName: player.last_name,
    teamSeasonId: membership?.team_season_id ?? null,
    teamName: team?.name ?? "Bez týmu",
    teamLogoUrl: team?.logoUrl ?? null,
    playedMatches: 0,
    wonMatches: 0,
    lostMatches: 0,
    winPercentage: 0,
    wonLegs: 0,
    lostLegs: 0,
    score95Plus: 0,
    score133Plus: 0,
    score171Plus: 0,
    checkout100Plus: 0,
    usefulnessScore: 0,
  };
}

function comparePlayerStats(first: PlayerStat, second: PlayerStat) {
  const usefulness = second.usefulnessScore - first.usefulnessScore;
  if (usefulness !== 0) return usefulness;

  const percentage = second.winPercentage - first.winPercentage;
  if (percentage !== 0) return percentage;

  const wins = second.wonMatches - first.wonMatches;
  if (wins !== 0) return wins;

  const legs = (second.wonLegs - second.lostLegs) - (first.wonLegs - first.lostLegs);
  if (legs !== 0) return legs;

  return first.displayName.localeCompare(second.displayName, "cs");
}

function addAchievement(stat: PlayerStat, achievement: MatchAchievement) {
  if (achievement.achievement_type === "score_95_plus") stat.score95Plus += achievement.achievement_count;
  if (achievement.achievement_type === "score_133_plus") stat.score133Plus += achievement.achievement_count;
  if (achievement.achievement_type === "score_171_plus") stat.score171Plus += achievement.achievement_count;
  if (achievement.achievement_type === "checkout_100_plus") stat.checkout100Plus += achievement.achievement_count;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const [
      seasons,
      leagues,
      groups,
      teamSeasons,
      groupTeams,
      memberships,
      players,
      teamsWithLogos,
      matches,
    ] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, is_active, starts_on")
        .is("deleted_at", null)
        .order("starts_on", { ascending: false })
        .returns<Season[]>(),
      supabase
        .from("leagues")
        .select("id, season_id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<League[]>(),
      supabase
        .from("league_groups")
        .select("id, league_id, name, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .returns<LeagueGroup[]>(),
      supabase
        .from("team_seasons")
        .select("id, team_id, season_id, display_name")
        .is("deleted_at", null)
        .returns<TeamSeason[]>(),
      supabase
        .from("league_group_teams")
        .select("league_group_id, team_season_id")
        .is("deleted_at", null)
        .returns<LeagueGroupTeam[]>(),
      supabase
        .from("team_memberships")
        .select("season_id, team_season_id, player_id, left_on")
        .is("deleted_at", null)
        .returns<Membership[]>(),
      supabase
        .from("players")
        .select("id, display_name, first_name, last_name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .returns<Player[]>(),
      supabase
        .from("teams")
        .select("id, name, slug, logo_url")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, status")
        .is("deleted_at", null)
        .returns<Match[]>(),
    ]);

    let teams = teamsWithLogos.data as Team[] | null;
    let teamsError = teamsWithLogos.error;
    if (teamsError?.message.includes("logo_url")) {
      const fallback = await supabase
        .from("teams")
        .select("id, name, slug")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<Team[]>();
      teams = fallback.data;
      teamsError = fallback.error;
    }

    const coreError =
      seasons.error ??
      leagues.error ??
      groups.error ??
      teamSeasons.error ??
      groupTeams.error ??
      memberships.error ??
      players.error ??
      teamsError ??
      matches.error;

    if (coreError) {
      return NextResponse.json({ error: "Hráče se nepodařilo načíst." }, { status: 500 });
    }

    const seasonRows = seasons.data ?? [];
    const leagueRows = leagues.data ?? [];
    const groupRows = groups.data ?? [];
    const teamSeasonRows = teamSeasons.data ?? [];
    const groupTeamRows = groupTeams.data ?? [];
    const membershipRows = memberships.data ?? [];
    const playerRows = players.data ?? [];
    const matchRows = matches.data ?? [];

    const activeSeason = seasonRows.find((season) => season.is_active) ?? seasonRows[0] ?? null;
    const selectedSeasonId = request.nextUrl.searchParams.get("season_id") || activeSeason?.id || "";
    const requestedLeagueId = request.nextUrl.searchParams.get("league_id") || "";
    const requestedGroupId = request.nextUrl.searchParams.get("group_id") || "";
    const selectedLeague =
      requestedLeagueId
        ? leagueRows.find(
            (league) =>
              league.id === requestedLeagueId &&
              league.season_id === selectedSeasonId,
          ) ?? null
        : null;
    const selectedGroup =
      selectedLeague && requestedGroupId
        ? groupRows.find(
            (group) =>
              group.id === requestedGroupId &&
              group.league_id === selectedLeague.id,
          ) ?? null
        : null;

    const teamRows = (teams ?? []).map((team) => ({
      ...team,
      logo_url: team.logo_url ?? bundledLogoUrls[team.slug] ?? null,
    }));
    const teamById = new Map(teamRows.map((team) => [team.id, team]));
    const teamSeasonById = new Map(teamSeasonRows.map((teamSeason) => [teamSeason.id, teamSeason]));

    const groupTeamSeasonIds = new Set(
      selectedGroup
        ? groupTeamRows
            .filter((assignment) => assignment.league_group_id === selectedGroup.id)
            .map((assignment) => assignment.team_season_id)
        : [],
    );
    const seasonTeamSeasonIds = new Set(
      teamSeasonRows
        .filter((teamSeason) => teamSeason.season_id === selectedSeasonId)
        .map((teamSeason) => teamSeason.id),
    );
    const baseTeamSeasonIds = groupTeamSeasonIds.size > 0 ? groupTeamSeasonIds : seasonTeamSeasonIds;
    const selectedTeamSeasonId = request.nextUrl.searchParams.get("team_season_id") ?? "";
    const eligibleTeamSeasonIds = selectedTeamSeasonId
      ? new Set([selectedTeamSeasonId])
      : new Set(baseTeamSeasonIds);

    const publicTeams = Array.from(baseTeamSeasonIds)
      .flatMap((teamSeasonId): PublicTeam[] => {
        const teamSeason = teamSeasonById.get(teamSeasonId);
        const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
        if (!teamSeason || !team) return [];
        return [{
          teamSeasonId,
          name: teamSeason.display_name || team.name,
          logoUrl: team.logo_url ?? null,
        }];
      })
      .sort((first, second) => first.name.localeCompare(second.name, "cs"));

    const teamByTeamSeasonId = new Map(publicTeams.map((team) => [team.teamSeasonId, team]));
    const activeMemberships = membershipRows.filter(
      (membership) =>
        membership.season_id === selectedSeasonId &&
        membership.left_on === null &&
        eligibleTeamSeasonIds.has(membership.team_season_id),
    );
    const membershipByPlayerId = new Map(activeMemberships.map((membership) => [membership.player_id, membership]));
    const eligiblePlayerIds = new Set(activeMemberships.map((membership) => membership.player_id));

    const search = normalizeSearch(request.nextUrl.searchParams.get("search") ?? "");
    const visiblePlayers = playerRows.filter((player) => {
      if (eligiblePlayerIds.size > 0 && !eligiblePlayerIds.has(player.id)) return false;
      if (!search) return true;

      const haystack = normalizeSearch(
        [player.display_name, player.first_name ?? "", player.last_name ?? ""].join(" "),
      );
      return haystack.includes(search);
    });

    const stats = new Map<string, PlayerStat>();
    visiblePlayers.forEach((player) => {
      const membership = membershipByPlayerId.get(player.id) ?? null;
      const team = membership ? teamByTeamSeasonId.get(membership.team_season_id) ?? null : null;
      stats.set(player.id, createEmptyStat(player, membership, team));
    });

    const selectedMatches = matchRows.filter(
      (match) =>
        isFinishedMatch(match) &&
        match.season_id === selectedSeasonId &&
        (!selectedLeague || match.league_id === selectedLeague.id) &&
        (!selectedGroup || match.group_id === selectedGroup.id) &&
        (eligibleTeamSeasonIds.size === 0 ||
          eligibleTeamSeasonIds.has(match.home_team_id) ||
          eligibleTeamSeasonIds.has(match.away_team_id)),
    );
    const selectedMatchIds = selectedMatches.map((match) => match.id);
    const playedTeamMatchesByTeamSeasonId = new Map<string, number>();
    selectedMatches.forEach((match) => {
      playedTeamMatchesByTeamSeasonId.set(
        match.home_team_id,
        (playedTeamMatchesByTeamSeasonId.get(match.home_team_id) ?? 0) + 1,
      );
      playedTeamMatchesByTeamSeasonId.set(
        match.away_team_id,
        (playedTeamMatchesByTeamSeasonId.get(match.away_team_id) ?? 0) + 1,
      );
    });

    let gameRows: MatchGame[] = [];
    let gamePlayerRows: MatchGamePlayer[] = [];
    let achievementRows: MatchAchievement[] = [];
    let importedStatisticRows: ImportedPlayerStat[] = [];

    if (selectedSeasonId) {
      let importedStatisticsQuery = supabase
        .from("player_season_statistics")
        .select(
          "player_id, team_season_id, played_matches, won_matches, lost_matches, played_legs, won_legs, lost_legs, score_95_plus, score_133_plus, score_171_plus, checkout_100_plus",
        )
        .eq("season_id", selectedSeasonId)
        .is("deleted_at", null);

      if (selectedLeague) {
        importedStatisticsQuery = importedStatisticsQuery.eq("league_id", selectedLeague.id);
      }

      if (selectedGroup) {
        importedStatisticsQuery = importedStatisticsQuery.eq("group_id", selectedGroup.id);
      }

      if (selectedTeamSeasonId) {
        importedStatisticsQuery = importedStatisticsQuery.eq("team_season_id", selectedTeamSeasonId);
      }

      const importedStatistics = await importedStatisticsQuery.returns<ImportedPlayerStat[]>();
      importedStatisticRows = importedStatistics.error ? [] : importedStatistics.data ?? [];
    }

    if (importedStatisticRows.length > 0) {
      const importedByPlayerId = new Map<string, ImportedPlayerStat>();
      importedStatisticRows.forEach((importedStatistic) => {
        const current = importedByPlayerId.get(importedStatistic.player_id);
        if (!current) {
          importedByPlayerId.set(importedStatistic.player_id, { ...importedStatistic });
          return;
        }

        current.played_matches += importedStatistic.played_matches;
        current.won_matches += importedStatistic.won_matches;
        current.lost_matches += importedStatistic.lost_matches;
        current.played_legs += importedStatistic.played_legs;
        current.won_legs += importedStatistic.won_legs;
        current.lost_legs += importedStatistic.lost_legs;
        current.score_95_plus += importedStatistic.score_95_plus;
        current.score_133_plus += importedStatistic.score_133_plus;
        current.score_171_plus += importedStatistic.score_171_plus;
        current.checkout_100_plus += importedStatistic.checkout_100_plus;
      });

      importedByPlayerId.forEach((importedStatistic) => {
        const stat = stats.get(importedStatistic.player_id);
        if (!stat) return;

        stat.teamSeasonId = importedStatistic.team_season_id ?? stat.teamSeasonId;
        stat.playedMatches = importedStatistic.played_matches;
        stat.wonMatches = importedStatistic.won_matches;
        stat.lostMatches = importedStatistic.lost_matches;
        stat.wonLegs = importedStatistic.won_legs;
        stat.lostLegs = importedStatistic.lost_legs;
        stat.score95Plus = importedStatistic.score_95_plus;
        stat.score133Plus = importedStatistic.score_133_plus;
        stat.score171Plus = importedStatistic.score_171_plus;
        stat.checkout100Plus = importedStatistic.checkout_100_plus;
      });
    } else if (selectedMatchIds.length > 0) {
      const games = await supabase
        .from("match_games")
        .select("id, match_id, game_type, home_legs, away_legs, winner_side")
        .in("match_id", selectedMatchIds)
        .is("deleted_at", null)
        .returns<MatchGame[]>();

      gameRows = games.error ? [] : games.data ?? [];

      const gameIds = gameRows.map((game) => game.id);
      if (gameIds.length > 0) {
        const [gamePlayers, achievements] = await Promise.all([
          supabase
            .from("match_game_players")
            .select("match_game_id, side, player_id")
            .in("match_game_id", gameIds)
            .is("deleted_at", null)
            .returns<MatchGamePlayer[]>(),
          supabase
            .from("match_game_achievements")
            .select("player_id, achievement_type, achievement_count")
            .in("match_id", selectedMatchIds)
            .is("deleted_at", null)
            .returns<MatchAchievement[]>(),
        ]);

        gamePlayerRows = gamePlayers.error ? [] : gamePlayers.data ?? [];
        achievementRows = achievements.error ? [] : achievements.data ?? [];
      }
    }

    const gamePlayersByGameId = new Map<string, MatchGamePlayer[]>();
    gamePlayerRows.forEach((gamePlayer) => {
      gamePlayersByGameId.set(gamePlayer.match_game_id, [
        ...(gamePlayersByGameId.get(gamePlayer.match_game_id) ?? []),
        gamePlayer,
      ]);
    });

    gameRows
      .filter((game) => game.game_type === "singles" && game.winner_side)
      .forEach((game) => {
        const gamePlayers = gamePlayersByGameId.get(game.id) ?? [];
        gamePlayers.forEach((gamePlayer) => {
          const stat = stats.get(gamePlayer.player_id);
          if (!stat) return;

          const wonLegs = gamePlayer.side === "home" ? game.home_legs : game.away_legs;
          const lostLegs = gamePlayer.side === "home" ? game.away_legs : game.home_legs;
          stat.playedMatches += 1;
          stat.wonLegs += wonLegs;
          stat.lostLegs += lostLegs;

          if (gamePlayer.side === game.winner_side) {
            stat.wonMatches += 1;
          } else {
            stat.lostMatches += 1;
          }
        });
      });

    achievementRows.forEach((achievement) => {
      const stat = stats.get(achievement.player_id);
      if (stat) addAchievement(stat, achievement);
    });

    const playerStats = Array.from(stats.values()).map((stat) => {
      const playedTeamMatches = stat.teamSeasonId
        ? playedTeamMatchesByTeamSeasonId.get(stat.teamSeasonId) ?? 0
        : 0;
      const maxPossibleSingles = Math.max(playedTeamMatches * 4, stat.playedMatches);

      return {
        ...stat,
        winPercentage: stat.playedMatches > 0 ? Math.round((stat.wonMatches / stat.playedMatches) * 1000) / 10 : 0,
        usefulnessScore: calculateUsefulnessScore(stat, maxPossibleSingles),
      };
    });

    return NextResponse.json({
      seasons: seasonRows,
      leagues: leagueRows,
      groups: groupRows,
      teams: publicTeams,
      memberships: activeMemberships,
      players: visiblePlayers,
      selected: {
        seasonId: selectedSeasonId,
        leagueId: selectedLeague?.id ?? "",
        groupId: selectedGroup?.id ?? "",
        teamSeasonId: selectedTeamSeasonId,
        search,
      },
      playerStats: playerStats.sort(comparePlayerStats),
    });
  } catch {
    return NextResponse.json({ error: "Hráče se nepodařilo načíst." }, { status: 500 });
  }
}
