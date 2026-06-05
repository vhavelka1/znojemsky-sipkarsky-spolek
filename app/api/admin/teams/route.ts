import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type CreateTeamBody = {
  name?: unknown;
  playing_venue_address?: unknown;
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

function withBundledLogo<T extends { slug: string; logo_url?: string | null }>(
  team: T,
) {
  return {
    ...team,
    logo_url: team.logo_url ?? bundledLogoUrls[team.slug] ?? null,
  };
}

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace týmů není povolena." },
    { status: 403 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json(
    { error: "Pro tuto akci je potřeba role administrátora." },
    { status: 403 },
  );
}

function requiredString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createSlug(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || crypto.randomUUID()
  );
}

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nepodařilo se načíst serverové nastavení.",
        },
        { status: 500 },
      ),
    };
  }
}

function guardRequest() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  return mockAdminResponse();
}

export async function GET() {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, slug, logo_url, playing_venue_address, created_at, updated_at, deleted_at")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  let teams: Array<Record<string, unknown> & { slug: string; logo_url?: string | null }> = [];

  if (error?.message.includes("logo_url") || error?.message.includes("playing_venue_address")) {
    const fallback = await supabase
      .from("teams")
      .select("id, name, slug, created_at, updated_at, deleted_at")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    teams = (fallback.data ?? []).map(withBundledLogo);
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    teams = (data ?? []).map(withBundledLogo);
  }

  const { data: activeSeason, error: activeSeasonError } = await supabase
    .from("seasons")
    .select("id, name, is_active")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (activeSeasonError) {
    return NextResponse.json({ error: activeSeasonError.message }, { status: 500 });
  }

  let teamSeasons: Array<{
    id: string;
    team_id: string;
    season_id: string;
    display_name: string | null;
  }> = [];
  let memberships: Array<{
    id: string;
    team_season_id: string;
    player_id: string;
    member_role: string;
    left_on: string | null;
  }> = [];
  let players: Array<{
    id: string;
    display_name: string;
  }> = [];

  if (activeSeason) {
    const { data: teamSeasonData, error: teamSeasonError } = await supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name")
      .eq("season_id", activeSeason.id)
      .is("deleted_at", null);

    if (teamSeasonError) {
      return NextResponse.json({ error: teamSeasonError.message }, { status: 500 });
    }

    teamSeasons = teamSeasonData ?? [];
    const teamSeasonIds = teamSeasons.map((teamSeason) => teamSeason.id);

    if (teamSeasonIds.length > 0) {
      const { data: membershipData, error: membershipError } = await supabase
        .from("team_memberships")
        .select("id, team_season_id, player_id, member_role, left_on")
        .in("team_season_id", teamSeasonIds)
        .is("left_on", null)
        .is("deleted_at", null);

      if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      memberships = membershipData ?? [];
      const playerIds = Array.from(new Set(memberships.map((membership) => membership.player_id)));

      if (playerIds.length > 0) {
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, display_name")
          .in("id", playerIds)
          .is("deleted_at", null)
          .order("display_name", { ascending: true });

        if (playerError) {
          return NextResponse.json({ error: playerError.message }, { status: 500 });
        }

        players = playerData ?? [];
      }
    }
  }

  return NextResponse.json({
    activeSeason,
    memberships,
    players,
    teams,
    teamSeasons,
  });
}

export async function POST(request: Request) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const adminResponse = mockAdminResponse();
  if (adminResponse) {
    return adminResponse;
  }

  const body = (await request.json().catch(() => null)) as CreateTeamBody | null;
  const name = requiredString(body?.name);

  if (!name) {
    return NextResponse.json(
      { error: "Název týmu je povinný." },
      { status: 400 },
    );
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name,
      slug: createSlug(name),
      playing_venue_address: optionalString(body?.playing_venue_address),
    })
    .select("id, name, slug, playing_venue_address, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ team: withBundledLogo(data) }, { status: 201 });
}
