import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

type UpdateCaptainTeamBody = {
  public_description?: unknown;
  home_venue?: unknown;
  public_contact_email?: unknown;
  website_url?: unknown;
};

type TeamMembership = {
  id: string;
  season_id: string;
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
  joined_on: string | null;
  left_on: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean | null;
};

type AvailablePlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  residence: string | null;
  date_of_birth: string | null;
};

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  played_at: string | null;
  status: "scheduled" | "played" | "awaiting_confirmation" | "confirmed" | "cancelled";
};

type MatchResultRow = {
  match_id: string;
  home_points: number;
  away_points: number;
};

type TeamSeasonRow = {
  id: string;
  display_name: string | null;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roleLabel(role: TeamMembership["member_role"]) {
  if (role === "captain") return "Kapitán";
  if (role === "assistant_captain") return "Zástupce kapitána";
  return "Hráč";
}

function statusLabel(status: MatchRow["status"]) {
  if (status === "scheduled") return "naplánováno";
  if (status === "played") return "odehráno";
  if (status === "awaiting_confirmation") return "čeká na potvrzení";
  if (status === "confirmed") return "potvrzeno";
  return "zrušeno";
}

function optionalEmail(value: unknown) {
  const email = optionalString(value);
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "invalid";
}

async function getCaptainContext(request: Request) {
  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return {
      response: NextResponse.json({ error: "Pro správu týmu se nejprve přihlaste." }, { status: 401 }),
      requester: null,
      supabase: null,
      captainMembership: null,
      teamSeason: null,
      team: null,
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!requester.playerId) {
    return {
      response: NextResponse.json({ error: "Uživatel není propojený s hráčem." }, { status: 403 }),
      requester,
      supabase,
      captainMembership: null,
      teamSeason: null,
      team: null,
    };
  }

  const { data: captainMembership, error: membershipError } = await supabase
    .from("team_memberships")
    .select("id, season_id, team_season_id, player_id, member_role")
    .eq("player_id", requester.playerId)
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError || !captainMembership) {
    return {
      response: NextResponse.json({ error: "Nejste vedený jako kapitán nebo zástupce kapitána aktivního týmu." }, { status: 403 }),
      requester,
      supabase,
      captainMembership: null,
      teamSeason: null,
      team: null,
    };
  }

  const { data: teamSeason, error: teamSeasonError } = await supabase
    .from("team_seasons")
    .select("id, team_id, season_id, display_name, home_venue, contact_email")
    .eq("id", captainMembership.team_season_id)
    .is("deleted_at", null)
    .single();

  if (teamSeasonError || !teamSeason) {
    return {
      response: NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 }),
      requester,
      supabase,
      captainMembership,
      teamSeason: null,
      team: null,
    };
  }

  let teamResult = await supabase
    .from("teams")
    .select("id, name, slug, logo_url, playing_venue_address, public_description, public_contact_email, website_url")
    .eq("id", teamSeason.team_id)
    .is("deleted_at", null)
    .single();

  if (
    teamResult.error?.message.includes("public_description") ||
    teamResult.error?.message.includes("public_contact_email") ||
    teamResult.error?.message.includes("website_url") ||
    teamResult.error?.message.includes("logo_url") ||
    teamResult.error?.message.includes("playing_venue_address")
  ) {
    teamResult = await supabase
      .from("teams")
      .select("id, name, slug")
      .eq("id", teamSeason.team_id)
      .is("deleted_at", null)
      .single();
  }

  if (teamResult.error || !teamResult.data) {
    return {
      response: NextResponse.json({ error: "Tým se nepodařilo načíst." }, { status: 500 }),
      requester,
      supabase,
      captainMembership,
      teamSeason,
      team: null,
    };
  }

  return {
    response: null,
    requester,
    supabase,
    captainMembership,
    teamSeason,
    team: {
      ...teamResult.data,
      logo_url: teamLogoUrl(teamResult.data.slug, teamResult.data.logo_url),
    },
  };
}

export async function GET(request: Request) {
  const context = await getCaptainContext(request);
  if (context.response) return context.response;

  const { supabase, captainMembership, teamSeason, team } = context;
  const [seasonResult, requestsResult, membershipsResult, assignmentResult, matchResult] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active")
      .eq("id", captainMembership.season_id)
      .single(),
    supabase
      .from("team_roster_requests")
      .select("id, requested_player_id, requested_player_name, requested_player_email, requested_player_phone, requested_player_residence, requested_player_date_of_birth, requested_player_note, status, admin_note, created_at")
      .eq("team_season_id", teamSeason.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("team_memberships")
      .select("id, season_id, team_season_id, player_id, member_role, joined_on, left_on")
      .eq("team_season_id", teamSeason.id)
      .eq("season_id", captainMembership.season_id)
      .is("deleted_at", null)
      .order("member_role", { ascending: true })
      .returns<TeamMembership[]>(),
    supabase
      .from("league_group_teams")
      .select("league_group_id, team_season_id")
      .eq("team_season_id", teamSeason.id)
      .is("deleted_at", null)
      .maybeSingle<{ league_group_id: string; team_season_id: string }>(),
    supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, scheduled_at, played_at, status")
      .or(`home_team_id.eq.${teamSeason.id},away_team_id.eq.${teamSeason.id}`)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(12)
      .returns<MatchRow[]>(),
  ]);

  if (seasonResult.error) {
    return NextResponse.json({ error: "Sezónu se nepodařilo načíst." }, { status: 500 });
  }

  const memberships = membershipsResult.error ? [] : membershipsResult.data ?? [];
  const playerIds = memberships.map((membership) => membership.player_id);
  const matchRows = matchResult.data ?? [];
  const matchIds = matchRows.map((match) => match.id);
  const opponentTeamSeasonIds = Array.from(
    new Set(
      matchRows.map((match) => match.home_team_id === teamSeason.id ? match.away_team_id : match.home_team_id),
    ),
  );
  const [playersResult, groupResult, resultsResult, opponentTeamSeasonsResult, seasonMembershipsResult, allPlayersResult] = await Promise.all([
    playerIds.length > 0
      ? supabase
          .from("players")
          .select("id, display_name, email, phone, is_active")
          .in("id", playerIds)
          .is("deleted_at", null)
          .returns<PlayerRow[]>()
      : Promise.resolve({ data: [] as PlayerRow[], error: null }),
    assignmentResult.data?.league_group_id
      ? supabase
          .from("league_groups")
          .select("id, name, league_id")
          .eq("id", assignmentResult.data.league_group_id)
          .is("deleted_at", null)
          .maybeSingle<{ id: string; name: string; league_id: string }>()
      : Promise.resolve({ data: null, error: null }),
    matchIds.length > 0
      ? supabase
          .from("match_results")
          .select("match_id, home_points, away_points")
          .in("match_id", matchIds)
          .returns<MatchResultRow[]>()
      : Promise.resolve({ data: [] as MatchResultRow[], error: null }),
    opponentTeamSeasonIds.length > 0
      ? supabase
          .from("team_seasons")
          .select("id, display_name")
          .in("id", opponentTeamSeasonIds)
          .is("deleted_at", null)
          .returns<TeamSeasonRow[]>()
      : Promise.resolve({ data: [] as TeamSeasonRow[], error: null }),
    supabase
      .from("team_memberships")
      .select("player_id")
      .eq("season_id", captainMembership.season_id)
      .is("left_on", null)
      .is("deleted_at", null)
      .returns<Array<{ player_id: string }>>(),
    supabase
      .from("players")
      .select("id, display_name, first_name, last_name, email, phone, residence, date_of_birth")
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .returns<AvailablePlayerRow[]>(),
  ]);
  const leagueResult = groupResult.data?.league_id
    ? await supabase
        .from("leagues")
        .select("id, name")
        .eq("id", groupResult.data.league_id)
        .is("deleted_at", null)
        .maybeSingle<{ id: string; name: string }>()
    : { data: null, error: null };

  const playerById = new Map((playersResult.data ?? []).map((player) => [player.id, player]));
  const resultsByMatchId = new Map((resultsResult.data ?? []).map((result) => [result.match_id, result]));
  const opponentById = new Map((opponentTeamSeasonsResult.data ?? []).map((opponent) => [opponent.id, opponent]));
  const assignedPlayerIds = new Set((seasonMembershipsResult.data ?? []).map((membership) => membership.player_id));
  const availablePlayers = (allPlayersResult.data ?? [])
    .filter((player) => !assignedPlayerIds.has(player.id))
    .map((player) => ({
      id: player.id,
      displayName: player.display_name,
      firstName: player.first_name,
      lastName: player.last_name,
      email: player.email,
      phone: player.phone,
      residence: player.residence,
      dateOfBirth: player.date_of_birth,
    }));
  const roleOrder = { captain: 0, assistant_captain: 1, player: 2 };
  const roster = memberships
    .map((membership) => {
      const player = playerById.get(membership.player_id);
      return {
        id: membership.id,
        playerId: membership.player_id,
        displayName: player?.display_name ?? "Neznámý hráč",
        email: player?.email ?? null,
        phone: player?.phone ?? null,
        role: membership.member_role,
        roleLabel: roleLabel(membership.member_role),
        statusLabel: membership.left_on ? "Ukončeno" : player?.is_active === false ? "Neaktivní hráč" : "Aktivní",
        joinedOn: membership.joined_on,
      };
    })
    .sort((first, second) => roleOrder[first.role] - roleOrder[second.role] || first.displayName.localeCompare(second.displayName, "cs"));

  const matches = matchRows.map((match) => {
    const result = resultsByMatchId.get(match.id) ?? null;
    const isHome = match.home_team_id === teamSeason.id;
    const opponentId = isHome ? match.away_team_id : match.home_team_id;
    const opponent = opponentById.get(opponentId);
    return {
      id: match.id,
      scheduledAt: match.scheduled_at,
      playedAt: match.played_at,
      status: match.status,
      statusLabel: statusLabel(match.status),
      side: isHome ? "Domácí" : "Hosté",
      opponentName: opponent?.display_name ?? "Soupeř",
      result: result ? `${result.home_points}:${result.away_points}` : null,
    };
  });

  return NextResponse.json({
    team: {
      id: team.id,
      teamSeasonId: teamSeason.id,
      name: teamSeason.display_name || team.name,
      logoUrl: team.logo_url ?? null,
      publicDescription: team.public_description ?? "",
      homeVenue: team.playing_venue_address ?? teamSeason.home_venue ?? "",
      publicContactEmail: team.public_contact_email ?? teamSeason.contact_email ?? "",
      websiteUrl: team.website_url ?? "",
      seasonName: seasonResult.data?.name ?? "Sezóna",
      publicDetailHref: `/tymy/${team.id}`,
      rosterHref: "/muj-tym#soupiska",
      competitionHref: groupResult.data ? `/tabulky?season_id=${captainMembership.season_id}&league_id=${groupResult.data.league_id}&group_id=${groupResult.data.id}` : "/tabulky",
    },
    competition: groupResult.data && leagueResult.data ? {
      seasonId: captainMembership.season_id,
      seasonName: seasonResult.data?.name ?? "Sezóna",
      leagueId: leagueResult.data.id,
      leagueName: leagueResult.data.name,
      groupId: groupResult.data.id,
      groupName: groupResult.data.name,
      href: `/tabulky?season_id=${captainMembership.season_id}&league_id=${leagueResult.data.id}&group_id=${groupResult.data.id}`,
    } : null,
    roster,
    matches,
    availablePlayers,
    requests: requestsResult.error ? [] : requestsResult.data ?? [],
  });
}

export async function PATCH(request: Request) {
  const context = await getCaptainContext(request);
  if (context.response) return context.response;

  const body = (await request.json().catch(() => null)) as UpdateCaptainTeamBody | null;
  const publicContactEmail = optionalEmail(body?.public_contact_email);
  if (publicContactEmail === "invalid") {
    return NextResponse.json({ error: "Zadejte platný veřejný kontaktní email." }, { status: 400 });
  }

  const { supabase, teamSeason, team } = context;
  const websiteUrl = optionalString(body?.website_url);
  const homeVenue = optionalString(body?.home_venue);
  const publicDescription = optionalString(body?.public_description);

  const { error: teamError } = await supabase
    .from("teams")
    .update({
      playing_venue_address: homeVenue,
      public_description: publicDescription,
      public_contact_email: publicContactEmail,
      website_url: websiteUrl,
    })
    .eq("id", team.id)
    .is("deleted_at", null);

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }

  const { error: teamSeasonError } = await supabase
    .from("team_seasons")
    .update({
      home_venue: homeVenue,
      contact_email: publicContactEmail,
    })
    .eq("id", teamSeason.id)
    .is("deleted_at", null);

  if (teamSeasonError) {
    return NextResponse.json({ error: teamSeasonError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
