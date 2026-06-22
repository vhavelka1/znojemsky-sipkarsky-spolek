import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type Team = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  playing_venue_address?: string | null;
  public_description?: string | null;
  public_contact_email?: string | null;
  website_url?: string | null;
};

type TeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
  home_venue: string | null;
  contact_email: string | null;
};

type Season = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on: string;
};

type Membership = {
  id: string;
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
  left_on: string | null;
};

type Player = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

type Match = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string | null;
  played_at: string | null;
  status: "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
};

type MatchResult = {
  match_id: string;
  home_points: number;
  away_points: number;
};

function isMissingOptionalTeamColumn(message: string) {
  return ["logo_url", "playing_venue_address", "public_description", "public_contact_email", "website_url"].some(
    (column) => message.includes(column),
  );
}

function statusLabel(status: Match["status"]) {
  if (status === "scheduled") return "naplánováno";
  if (status === "played") return "odehráno";
  if (status === "awaiting_confirmation") return "čeká na potvrzení";
  if (status === "confirmed") return "potvrzeno";
  return "zrušeno";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createSupabaseAdminClient();

    let teamResult = await supabase
      .from("teams")
      .select("id, name, slug, logo_url, playing_venue_address, public_description, public_contact_email, website_url")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<Team>();

    if (teamResult.error?.message && isMissingOptionalTeamColumn(teamResult.error.message)) {
      teamResult = await supabase
        .from("teams")
        .select("id, name, slug")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle<Team>();
    }

    if (teamResult.error) {
      return NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 });
    }

    if (!teamResult.data) {
      return NextResponse.json({ error: "Tým nebyl nalezen." }, { status: 404 });
    }

    const team = {
      ...teamResult.data,
      logo_url: teamLogoUrl(teamResult.data.slug, teamResult.data.logo_url),
    };

    const [seasons, teamSeasons] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, is_active, starts_on")
        .is("deleted_at", null)
        .order("starts_on", { ascending: false })
        .returns<Season[]>(),
      supabase
        .from("team_seasons")
        .select("id, team_id, season_id, display_name, home_venue, contact_email")
        .eq("team_id", id)
        .is("deleted_at", null)
        .returns<TeamSeason[]>(),
    ]);

    const error = seasons.error ?? teamSeasons.error;
    if (error) {
      return NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 });
    }

    const seasonRows = seasons.data ?? [];
    const activeSeason = seasonRows.find((season) => season.is_active) ?? seasonRows[0] ?? null;
    const currentTeamSeason =
      (teamSeasons.data ?? []).find((teamSeason) => teamSeason.season_id === activeSeason?.id) ??
      (teamSeasons.data ?? [])[0] ??
      null;

    const teamSeasonIds = (teamSeasons.data ?? []).map((teamSeason) => teamSeason.id);
    let memberships: Membership[] = [];
    let players: Player[] = [];
    let matches: Match[] = [];
    let matchResults: MatchResult[] = [];

    if (currentTeamSeason) {
      const membershipResult = await supabase
        .from("team_memberships")
        .select("id, team_season_id, player_id, member_role, left_on")
        .eq("team_season_id", currentTeamSeason.id)
        .is("deleted_at", null)
        .returns<Membership[]>();

      if (membershipResult.error) {
        return NextResponse.json({ error: "Soupisku se nepodařilo načíst." }, { status: 500 });
      }

      memberships = membershipResult.data ?? [];
      const playerIds = memberships.map((membership) => membership.player_id);

      if (playerIds.length > 0) {
        const playerResult = await supabase
          .from("players")
          .select("id, display_name, first_name, last_name")
          .in("id", playerIds)
          .is("deleted_at", null)
          .returns<Player[]>();

        if (!playerResult.error) {
          players = playerResult.data ?? [];
        }
      }
    }

    if (teamSeasonIds.length > 0) {
      const matchResult = await supabase
        .from("matches")
        .select("id, home_team_id, away_team_id, scheduled_at, played_at, status")
        .or(`home_team_id.in.(${teamSeasonIds.join(",")}),away_team_id.in.(${teamSeasonIds.join(",")})`)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: false })
        .returns<Match[]>();

      if (!matchResult.error) {
        matches = matchResult.data ?? [];
        const resultIds = matches.map((match) => match.id);
        if (resultIds.length > 0) {
          const results = await supabase
            .from("match_results")
            .select("match_id, home_points, away_points")
            .in("match_id", resultIds)
            .returns<MatchResult[]>();
          matchResults = results.error ? [] : results.data ?? [];
        }
      }
    }

    const playerById = new Map(players.map((player) => [player.id, player]));
    const roster = memberships
      .filter((membership) => membership.left_on === null)
      .flatMap((membership) => {
        const player = playerById.get(membership.player_id);
        if (!player) return [];
        return [
          {
            id: player.id,
            displayName: player.display_name,
            firstName: player.first_name,
            lastName: player.last_name,
            role: membership.member_role,
          },
        ];
      })
      .sort((first, second) => {
        const roleOrder = { captain: 0, assistant_captain: 1, player: 2 };
        return roleOrder[first.role] - roleOrder[second.role] || first.displayName.localeCompare(second.displayName, "cs");
      });

    const resultByMatchId = new Map(matchResults.map((result) => [result.match_id, result]));
    const mappedMatches = matches.map((match) => ({
      id: match.id,
      date: match.played_at ?? match.scheduled_at,
      status: match.status,
      statusLabel: statusLabel(match.status),
      isHome: teamSeasonIds.includes(match.home_team_id),
      result: resultByMatchId.get(match.id) ?? null,
    }));
    const latestMatches = mappedMatches
      .filter((match) => match.status !== "scheduled")
      .slice(0, 5);
    const upcomingMatches = mappedMatches
      .filter((match) => match.status === "scheduled")
      .sort((first, second) => String(first.date ?? "").localeCompare(String(second.date ?? "")))
      .slice(0, 5);

    let wins = 0;
    let losses = 0;
    let draws = 0;
    mappedMatches.forEach((match) => {
      if (!match.result || match.status === "scheduled" || match.status === "cancelled") return;
      const own = match.isHome ? match.result.home_points : match.result.away_points;
      const opponent = match.isHome ? match.result.away_points : match.result.home_points;
      if (own > opponent) wins += 1;
      else if (own < opponent) losses += 1;
      else draws += 1;
    });

    const requester = await getCurrentUserProfile(request).catch(() => null);
    const canManage = Boolean(
      requester?.isActive &&
        requester.playerId &&
        roster.some((player) => player.id === requester.playerId && player.role === "captain"),
    );

    return NextResponse.json({
      team: {
        id: team.id,
        name: currentTeamSeason?.display_name || team.name,
        slug: team.slug,
        logoUrl: team.logo_url ?? null,
        publicDescription: team.public_description ?? null,
        homeVenue: team.playing_venue_address ?? currentTeamSeason?.home_venue ?? null,
        publicContactEmail: team.public_contact_email ?? currentTeamSeason?.contact_email ?? null,
        websiteUrl: team.website_url ?? null,
        seasonName: activeSeason?.name ?? null,
        captain: roster.find((player) => player.role === "captain")?.displayName ?? null,
      },
      roster,
      latestMatches,
      upcomingMatches,
      statistics: {
        played: wins + losses + draws,
        wins,
        draws,
        losses,
      },
      canManage,
    });
  } catch {
    return NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 });
  }
}
