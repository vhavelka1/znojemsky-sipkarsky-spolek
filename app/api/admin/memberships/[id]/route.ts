import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type UpdateMembershipBody = {
  team_id?: unknown;
  season_id?: unknown;
  member_role?: unknown;
  joined_on?: unknown;
  left_on?: unknown;
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

function optionalDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function membershipRole(value: unknown) {
  if (value === "captain") {
    return "captain";
  }

  if (value === "assistant_captain") {
    return "assistant_captain";
  }

  return "player";
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

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) {
    return guard.response;
  }

  const body = (await request.json().catch(() => null)) as UpdateMembershipBody | null;
  const teamId = requiredString(body?.team_id);
  const seasonId = requiredString(body?.season_id);
  const joinedOn = requiredString(body?.joined_on);
  const leftOn = optionalDate(body?.left_on);
  const memberRole = membershipRole(body?.member_role);

  if (!teamId || !seasonId || !joinedOn) {
    return NextResponse.json(
      { error: "Vyberte tým, sezónu a datum začátku členství." },
      { status: 400 },
    );
  }

  if (leftOn && leftOn < joinedOn) {
    return NextResponse.json(
      { error: "Datum ukončení nemůže být dříve než datum začátku." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data: existingMembership, error: existingMembershipError } = await supabase
    .from("team_memberships")
    .select("id, player_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingMembershipError) {
    return NextResponse.json(
      { error: existingMembershipError.message },
      { status: 500 },
    );
  }

  if (!existingMembership) {
    return NextResponse.json(
      { error: "Členství nebylo nalezeno." },
      { status: 404 },
    );
  }

  const { data: existingTeamSeason, error: teamSeasonLookupError } = await supabase
    .from("team_seasons")
    .select("id")
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .is("deleted_at", null)
    .maybeSingle();

  if (teamSeasonLookupError) {
    return NextResponse.json(
      { error: teamSeasonLookupError.message },
      { status: 500 },
    );
  }

  let teamSeasonId = existingTeamSeason?.id;

  if (!teamSeasonId) {
    const { data: createdTeamSeason, error: createTeamSeasonError } = await supabase
      .from("team_seasons")
      .insert({
        season_id: seasonId,
        team_id: teamId,
      })
      .select("id")
      .single();

    if (createTeamSeasonError) {
      return NextResponse.json(
        { error: createTeamSeasonError.message },
        { status: 500 },
      );
    }

    teamSeasonId = createdTeamSeason.id;
  }

  const { data: membership, error: updateError } = await supabase
    .from("team_memberships")
    .update({
      joined_on: joinedOn,
      left_on: leftOn,
      member_role: memberRole,
      season_id: seasonId,
      team_season_id: teamSeasonId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(
      "id, season_id, team_season_id, player_id, member_role, joined_on, left_on, created_at",
    )
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ membership });
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) {
    return guard.response;
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { error } = await supabase
    .from("team_memberships")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Členství bylo odstraněno." });
}
