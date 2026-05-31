import { NextResponse } from "next/server";
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

type Match = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  played_at: string | null;
  status: "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
};

type MatchResult = {
  match_id: string;
  home_points: number;
  away_points: number;
};

type StandingRow = {
  teamSeasonId: string;
  teamName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
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

function compareStandingRows(first: StandingRow, second: StandingRow) {
  const pointsDiff = second.points - first.points;
  if (pointsDiff !== 0) return pointsDiff;

  const scoreDiff =
    second.scoreFor - second.scoreAgainst - (first.scoreFor - first.scoreAgainst);
  if (scoreDiff !== 0) return scoreDiff;

  const scoreForDiff = second.scoreFor - first.scoreFor;
  return scoreForDiff !== 0 ? scoreForDiff : first.teamName.localeCompare(second.teamName, "cs");
}

function isFinalMatch(match: Match) {
  return match.status === "confirmed" || match.status === "played";
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [
      players,
      teamsWithLogos,
      seasons,
      leagues,
      groups,
      teamSeasons,
      assignments,
      matches,
      results,
    ] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("teams")
        .select("id, name, slug, logo_url")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
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
        .from("matches")
        .select("id, season_id, league_id, group_id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .is("deleted_at", null)
        .returns<Match[]>(),
      supabase
        .from("match_results")
        .select("match_id, home_points, away_points")
        .is("deleted_at", null)
        .returns<MatchResult[]>(),
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

    const error =
      players.error ??
      teamsError ??
      seasons.error ??
      leagues.error ??
      groups.error ??
      teamSeasons.error ??
      assignments.error ??
      matches.error ??
      results.error;

    if (error) {
      return NextResponse.json({ error: "Veřejný přehled se nepodařilo načíst." }, { status: 500 });
    }

    const activeSeason = (seasons.data ?? []).find((season) => season.is_active) ?? seasons.data?.[0] ?? null;
    const activeLeague = (leagues.data ?? []).find((league) => league.season_id === activeSeason?.id) ?? null;
    const activeGroup = (groups.data ?? []).find((group) => group.league_id === activeLeague?.id) ?? null;
    const teamRows = (teams ?? []).map((team) => ({
      ...team,
      logo_url: team.logo_url ?? bundledLogoUrls[team.slug] ?? null,
    }));
    const teamById = new Map(teamRows.map((team) => [team.id, team]));
    const teamSeasonById = new Map((teamSeasons.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
    const resultByMatchId = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const teamSeasonLabel = (teamSeasonId: string) => {
      const teamSeason = teamSeasonById.get(teamSeasonId);
      const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
      return {
        name: teamSeason?.display_name || team?.name || "Neznámý tým",
        logoUrl: team?.logo_url ?? null,
      };
    };

    const finalMatches = (matches.data ?? []).filter(isFinalMatch);
    const matchPreview = (match: Match) => {
      const result = resultByMatchId.get(match.id);
      return {
        id: match.id,
        scheduledAt: match.scheduled_at,
        playedAt: match.played_at,
        homeTeam: teamSeasonLabel(match.home_team_id),
        awayTeam: teamSeasonLabel(match.away_team_id),
        result: result ? { homePoints: result.home_points, awayPoints: result.away_points } : null,
      };
    };

    const latestResults = finalMatches
      .filter((match) => resultByMatchId.has(match.id))
      .sort((first, second) =>
        new Date(second.played_at ?? second.scheduled_at).getTime() -
        new Date(first.played_at ?? first.scheduled_at).getTime(),
      )
      .slice(0, 5)
      .map(matchPreview);
    const now = Date.now();
    const upcomingMatches = (matches.data ?? [])
      .filter((match) => match.status === "scheduled" && new Date(match.scheduled_at).getTime() >= now)
      .sort((first, second) => new Date(first.scheduled_at).getTime() - new Date(second.scheduled_at).getTime())
      .slice(0, 5)
      .map(matchPreview);

    const standings = new Map<string, StandingRow>();
    const activeTeamSeasonIds = new Set(
      (assignments.data ?? [])
        .filter((assignment) => assignment.league_group_id === activeGroup?.id)
        .map((assignment) => assignment.team_season_id),
    );
    activeTeamSeasonIds.forEach((teamSeasonId) => {
      const team = teamSeasonLabel(teamSeasonId);
      standings.set(teamSeasonId, {
        teamSeasonId,
        teamName: team.name,
        logoUrl: team.logoUrl,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        points: 0,
      });
    });
    finalMatches
      .filter((match) => match.group_id === activeGroup?.id)
      .forEach((match) => {
        const result = resultByMatchId.get(match.id);
        const home = standings.get(match.home_team_id);
        const away = standings.get(match.away_team_id);
        if (!result || !home || !away) return;

        home.played += 1;
        away.played += 1;
        home.scoreFor += result.home_points;
        home.scoreAgainst += result.away_points;
        away.scoreFor += result.away_points;
        away.scoreAgainst += result.home_points;
        if (result.home_points > result.away_points) {
          home.wins += 1;
          home.points += 2;
          away.losses += 1;
        } else if (result.home_points < result.away_points) {
          away.wins += 1;
          away.points += 2;
          home.losses += 1;
        } else {
          home.draws += 1;
          away.draws += 1;
          home.points += 1;
          away.points += 1;
        }
      });

    return NextResponse.json({
      activeSeason: activeSeason ? { id: activeSeason.id, name: activeSeason.name } : null,
      activeCompetition:
        activeLeague && activeGroup
          ? { leagueName: activeLeague.name, groupName: activeGroup.name }
          : null,
      counts: {
        teams: teamRows.length,
        players: players.count ?? 0,
        playedMatches: finalMatches.length,
      },
      latestResults,
      upcomingMatches,
      standings: Array.from(standings.values()).sort(compareStandingRows).slice(0, 5),
    });
  } catch {
    return NextResponse.json({ error: "Veřejný přehled se nepodařilo načíst." }, { status: 500 });
  }
}

