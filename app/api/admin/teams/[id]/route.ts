import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { parseTeamVenueList } from "@/lib/teamVenues";

type UpdateTeamBody = {
  name?: unknown;
  playing_venue_address?: unknown;
  home_venues?: unknown;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || crypto.randomUUID();
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

async function guardRequest(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  return guard.response;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guardResponse = await guardRequest(request);
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as UpdateTeamBody | null;
  const name = requiredString(body?.name);
  const venues = body?.home_venues === undefined ? undefined : parseTeamVenueList(body.home_venues);
  if (venues === null) {
    return NextResponse.json({ error: "Zadejte nejvýše 20 hracích míst, každé do 500 znaků." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Název týmu je povinný." }, { status: 400 });
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("teams")
    .update({
      name,
      slug: createSlug(name),
      playing_venue_address: venues ? venues[0] ?? null : optionalString(body?.playing_venue_address),
      ...(venues ? { additional_playing_venues: venues.slice(1) } : {}),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, slug, playing_venue_address, additional_playing_venues, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: activeSeason, error: seasonError } = await supabase.from("seasons")
    .select("id").eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (seasonError) {
    return NextResponse.json({ error: "Nepodařilo se načíst aktivní sezónu pro aktualizaci hracího místa." }, { status: 500 });
  }
  if (activeSeason) {
    const { error: venueError } = await supabase.from("team_seasons")
      .update({ home_venue: data.playing_venue_address }).eq("team_id", id)
      .eq("season_id", activeSeason.id).is("deleted_at", null);
    if (venueError) {
      return NextResponse.json({ error: "Nepodařilo se aktualizovat hrací místo týmu v aktivní sezóně." }, { status: 500 });
    }
  }

  return NextResponse.json({ team: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const guardResponse = await guardRequest(request);
  if (guardResponse) {
    return guardResponse;
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data, error } = await supabase
    .from("teams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, slug, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ team: data });
}
