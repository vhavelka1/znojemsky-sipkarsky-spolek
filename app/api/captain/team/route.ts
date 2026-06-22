import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { teamLogoUrl } from "@/lib/teamLogos";

type UpdateCaptainTeamBody = {
  logo_url?: unknown;
  public_description?: unknown;
  home_venue?: unknown;
  public_contact_email?: unknown;
  website_url?: unknown;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  if (requester.role !== "captain" && requester.role !== "moderator" && requester.role !== "admin") {
    return {
      response: NextResponse.json({ error: "Správa týmu je dostupná pouze kapitánům." }, { status: 403 }),
      requester,
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
    .eq("member_role", "captain")
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError || !captainMembership) {
    return {
      response: NextResponse.json({ error: "Nejste vedený jako kapitán aktivního týmu." }, { status: 403 }),
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
  const [seasonResult, requestsResult] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active")
      .eq("id", captainMembership.season_id)
      .single(),
    supabase
      .from("team_roster_requests")
      .select("id, requested_player_name, requested_player_email, requested_player_note, status, admin_note, created_at")
      .eq("team_season_id", teamSeason.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (seasonResult.error) {
    return NextResponse.json({ error: "Sezónu se nepodařilo načíst." }, { status: 500 });
  }

  return NextResponse.json({
    team: {
      id: team.id,
      name: teamSeason.display_name || team.name,
      logoUrl: team.logo_url ?? null,
      publicDescription: team.public_description ?? "",
      homeVenue: team.playing_venue_address ?? teamSeason.home_venue ?? "",
      publicContactEmail: team.public_contact_email ?? teamSeason.contact_email ?? "",
      websiteUrl: team.website_url ?? "",
      seasonName: seasonResult.data?.name ?? "Sezóna",
    },
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
  const logoUrl = optionalString(body?.logo_url);
  const websiteUrl = optionalString(body?.website_url);
  const homeVenue = optionalString(body?.home_venue);
  const publicDescription = optionalString(body?.public_description);

  const { error: teamError } = await supabase
    .from("teams")
    .update({
      logo_url: logoUrl,
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
