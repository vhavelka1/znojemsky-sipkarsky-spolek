import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole, requireAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ReviewBody = {
  id?: unknown;
  action?: unknown;
  admin_note?: unknown;
};

type RosterRequest = {
  id: string;
  season_id: string;
  team_season_id: string;
  requested_by_user_id: string;
  requested_player_name: string;
  requested_player_email: string | null;
  requested_player_note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  admin_note: string | null;
  created_at: string;
};

function requiredString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function guardModerator(request: Request) {
  const profile = await getCurrentUserProfile(request);
  if (!profile?.isActive) {
    return {
      profile,
      response: NextResponse.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 }),
    };
  }

  if (!hasAtLeastRole(profile.role, "moderator")) {
    return {
      profile,
      response: NextResponse.json({ error: "Pro tuto akci nemáte oprávnění." }, { status: 403 }),
    };
  }

  return { profile, response: null };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const guard = await guardModerator(request);
  if (guard.response) return guard.response;

  const supabase = createSupabaseAdminClient();
  const [requests, teamSeasons, teams, seasons] = await Promise.all([
    supabase
      .from("team_roster_requests")
      .select(
        "id, season_id, team_season_id, requested_by_user_id, requested_player_name, requested_player_email, requested_player_note, status, admin_note, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<RosterRequest[]>(),
    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name")
      .is("deleted_at", null),
    supabase
      .from("teams")
      .select("id, name")
      .is("deleted_at", null),
    supabase
      .from("seasons")
      .select("id, name")
      .is("deleted_at", null),
  ]);

  const error = requests.error ?? teamSeasons.error ?? teams.error ?? seasons.error;
  if (error) {
    return NextResponse.json({ error: "Žádosti se nepodařilo načíst." }, { status: 500 });
  }

  const teamSeasonById = new Map((teamSeasons.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
  const teamById = new Map((teams.data ?? []).map((team) => [team.id, team]));
  const seasonById = new Map((seasons.data ?? []).map((season) => [season.id, season]));

  const mappedRequests = (requests.data ?? []).map((rosterRequest) => {
    const teamSeason = teamSeasonById.get(rosterRequest.team_season_id);
    const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
    return {
      ...rosterRequest,
      teamName: teamSeason?.display_name || team?.name || "Tým",
      seasonName: seasonById.get(rosterRequest.season_id)?.name || "Sezóna",
    };
  });

  return NextResponse.json({ requests: mappedRequests });
}

export async function PATCH(request: Request) {
  const guard = await guardModerator(request);
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  const id = requiredString(body?.id);
  const action = requiredString(body?.action);
  const adminNote = optionalString(body?.admin_note);

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Vyberte platnou žádost a akci." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: rosterRequest, error: requestError } = await supabase
    .from("team_roster_requests")
    .select("id, season_id, team_season_id, requested_player_name, requested_player_email, status")
    .eq("id", id)
    .is("deleted_at", null)
    .single<RosterRequest>();

  if (requestError || !rosterRequest) {
    return NextResponse.json({ error: "Žádost nebyla nalezena." }, { status: 404 });
  }

  if (rosterRequest.status !== "pending") {
    return NextResponse.json({ error: "Tato žádost už byla zpracována." }, { status: 400 });
  }

  if (action === "reject") {
    const { data, error } = await supabase
      .from("team_roster_requests")
      .update({
        status: "rejected",
        reviewed_by_user_id: guard.profile.userId,
        reviewed_at: new Date().toISOString(),
        admin_note: adminNote,
      })
      .eq("id", id)
      .select("id, status, admin_note, reviewed_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ request: data });
  }

  let playerId: string | null = null;
  if (rosterRequest.requested_player_email) {
    const { data: playerByEmail } = await supabase
      .from("players")
      .select("id")
      .ilike("email", rosterRequest.requested_player_email)
      .is("deleted_at", null)
      .maybeSingle();
    playerId = playerByEmail?.id ?? null;
  }

  if (!playerId) {
    const { data: playerByName } = await supabase
      .from("players")
      .select("id")
      .ilike("display_name", rosterRequest.requested_player_name)
      .is("deleted_at", null)
      .maybeSingle();
    playerId = playerByName?.id ?? null;
  }

  if (!playerId) {
    const nameParts = rosterRequest.requested_player_name.trim().split(/\s+/);
    const { data: createdPlayer, error: createPlayerError } = await supabase
      .from("players")
      .insert({
        display_name: rosterRequest.requested_player_name,
        first_name: nameParts[0] ?? null,
        last_name: nameParts.slice(1).join(" ") || null,
        email: rosterRequest.requested_player_email,
        role: "player",
        is_active: true,
      })
      .select("id")
      .single();

    if (createPlayerError) {
      return NextResponse.json({ error: createPlayerError.message }, { status: 500 });
    }

    playerId = createdPlayer.id;
  }

  const { data: existingMembership, error: membershipLookupError } = await supabase
    .from("team_memberships")
    .select("id, team_season_id")
    .eq("player_id", playerId)
    .eq("season_id", rosterRequest.season_id)
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipLookupError) {
    return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
  }

  if (!existingMembership) {
    const { error: membershipError } = await supabase
      .from("team_memberships")
      .insert({
        season_id: rosterRequest.season_id,
        team_season_id: rosterRequest.team_season_id,
        player_id: playerId,
        member_role: "player",
        joined_on: todayIsoDate(),
      });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("team_roster_requests")
    .update({
      status: "approved",
      reviewed_by_user_id: guard.profile.userId,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote,
    })
    .eq("id", id)
    .select("id, status, admin_note, reviewed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const id = requiredString(url.searchParams.get("id"));

  if (!id) {
    return NextResponse.json({ error: "Vyberte platnou žádost." }, { status: 400 });
  }

  const deletedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("team_roster_requests")
    .update({
      deleted_at: deletedAt,
      reviewed_by_user_id: guard.profile!.userId,
      reviewed_at: deletedAt,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Žádost byla odstraněna." });
}
