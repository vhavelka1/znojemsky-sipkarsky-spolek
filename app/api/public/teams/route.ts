import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

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
  playing_venue_address?: string | null;
  public_contact_email?: string | null;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
  home_venue: string | null;
  contact_email: string | null;
};

type LeagueGroupTeam = {
  league_group_id: string;
  team_season_id: string;
};

type Membership = {
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
  left_on: string | null;
};

type Player = {
  id: string;
  display_name: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isMissingOptionalTeamColumn(message: string) {
  return ["logo_url", "playing_venue_address", "public_contact_email"].some((column) =>
    message.includes(column),
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const [seasons, leagues, groups, teamSeasons, groupTeams, memberships, players, teamsWithOptionalColumns] =
      await Promise.all([
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
          .select("id, team_id, season_id, display_name, home_venue, contact_email")
          .is("deleted_at", null)
          .returns<TeamSeason[]>(),
        supabase
          .from("league_group_teams")
          .select("league_group_id, team_season_id")
          .is("deleted_at", null)
          .returns<LeagueGroupTeam[]>(),
        supabase
          .from("team_memberships")
          .select("team_season_id, player_id, member_role, left_on")
          .is("deleted_at", null)
          .returns<Membership[]>(),
        supabase
          .from("players")
          .select("id, display_name")
          .is("deleted_at", null)
          .order("display_name", { ascending: true })
          .returns<Player[]>(),
        supabase
          .from("teams")
          .select("id, name, slug, logo_url, playing_venue_address, public_contact_email")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
      ]);

    let teamRows = teamsWithOptionalColumns.data as Team[] | null;
    let teamsError = teamsWithOptionalColumns.error;

    if (teamsError?.message && isMissingOptionalTeamColumn(teamsError.message)) {
      const fallback = await supabase
        .from("teams")
        .select("id, name, slug")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<Team[]>();
      teamRows = fallback.data;
      teamsError = fallback.error;
    }

    const error =
      seasons.error ??
      leagues.error ??
      groups.error ??
      teamSeasons.error ??
      groupTeams.error ??
      memberships.error ??
      players.error ??
      teamsError;

    if (error) {
      return NextResponse.json({ error: "Týmy se nepodařilo načíst." }, { status: 500 });
    }

    const seasonRows = seasons.data ?? [];
    const leagueRows = leagues.data ?? [];
    const groupRows = groups.data ?? [];
    const teamSeasonRows = teamSeasons.data ?? [];
    const groupTeamRows = groupTeams.data ?? [];
    const membershipRows = memberships.data ?? [];
    const playerRows = players.data ?? [];
    const teams = (teamRows ?? []).map((team) => ({
      ...team,
      logo_url: teamLogoUrl(team.slug, team.logo_url),
    }));

    const activeSeason = seasonRows.find((season) => season.is_active) ?? seasonRows[0] ?? null;
    const selectedSeasonId = request.nextUrl.searchParams.get("season_id") || activeSeason?.id || "";
    const selectedLeague =
      leagueRows.find(
        (league) =>
          league.id === request.nextUrl.searchParams.get("league_id") &&
          league.season_id === selectedSeasonId,
      ) ??
      leagueRows.find((league) => league.season_id === selectedSeasonId) ??
      null;
    const selectedGroup =
      groupRows.find(
        (group) =>
          group.id === request.nextUrl.searchParams.get("group_id") &&
          group.league_id === selectedLeague?.id,
      ) ??
      groupRows.find((group) => group.league_id === selectedLeague?.id) ??
      null;

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const teamSeasonById = new Map(teamSeasonRows.map((teamSeason) => [teamSeason.id, teamSeason]));
    const playerById = new Map(playerRows.map((player) => [player.id, player]));
    const search = normalizeSearch(request.nextUrl.searchParams.get("search") ?? "");

    const groupTeamSeasonIds = new Set(
      groupTeamRows
        .filter((assignment) => assignment.league_group_id === selectedGroup?.id)
        .map((assignment) => assignment.team_season_id),
    );
    const seasonTeamSeasonIds = new Set(
      teamSeasonRows
        .filter((teamSeason) => teamSeason.season_id === selectedSeasonId)
        .map((teamSeason) => teamSeason.id),
    );
    const baseTeamSeasonIds = groupTeamSeasonIds.size > 0 ? groupTeamSeasonIds : seasonTeamSeasonIds;

    const publicTeams = Array.from(baseTeamSeasonIds)
      .flatMap((teamSeasonId) => {
        const teamSeason = teamSeasonById.get(teamSeasonId);
        const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
        if (!teamSeason || !team) return [];

        const activeMemberships = membershipRows.filter(
          (membership) => membership.team_season_id === teamSeasonId && membership.left_on === null,
        );
        const captainMembership = activeMemberships.find((membership) => membership.member_role === "captain");
        const captain = captainMembership ? playerById.get(captainMembership.player_id)?.display_name ?? null : null;
        const name = teamSeason.display_name || team.name;
        const haystack = normalizeSearch([name, captain ?? "", team.playing_venue_address ?? ""].join(" "));

        if (search && !haystack.includes(search)) return [];

        return [
          {
            id: team.id,
            teamSeasonId,
            name,
            slug: team.slug,
            logoUrl: team.logo_url ?? null,
            seasonId: teamSeason.season_id,
            seasonName: seasonRows.find((season) => season.id === teamSeason.season_id)?.name ?? "Sezóna",
            captain,
            playerCount: activeMemberships.length,
            homeVenue: team.playing_venue_address ?? teamSeason.home_venue,
            publicContactEmail: team.public_contact_email ?? teamSeason.contact_email,
          },
        ];
      })
      .sort((first, second) => first.name.localeCompare(second.name, "cs"));

    return NextResponse.json({
      seasons: seasonRows,
      leagues: leagueRows,
      groups: groupRows,
      selected: {
        seasonId: selectedSeasonId,
        leagueId: selectedLeague?.id ?? "",
        groupId: selectedGroup?.id ?? "",
        search,
      },
      teams: publicTeams,
    });
  } catch {
    return NextResponse.json({ error: "Týmy se nepodařilo načíst." }, { status: 500 });
  }
}
