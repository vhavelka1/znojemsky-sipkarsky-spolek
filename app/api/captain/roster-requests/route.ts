import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type CreateRosterRequestBody = {
  requested_player_name?: unknown;
  requested_player_email?: unknown;
  requested_player_note?: unknown;
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

async function captainMembershipForRequest(request: Request) {
  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return {
      response: NextResponse.json({ error: "Pro odeslání žádosti se nejprve přihlaste." }, { status: 401 }),
      requester: null,
      supabase: null,
      membership: null,
    };
  }

  if (!requester.playerId) {
    return {
      response: NextResponse.json({ error: "Uživatel není propojený s hráčem." }, { status: 403 }),
      requester,
      supabase: null,
      membership: null,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: membership, error } = await supabase
    .from("team_memberships")
    .select("id, season_id, team_season_id, member_role")
    .eq("player_id", requester.playerId)
    .eq("member_role", "captain")
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !membership) {
    return {
      response: NextResponse.json({ error: "Žádosti může odesílat pouze kapitán týmu." }, { status: 403 }),
      requester,
      supabase,
      membership: null,
    };
  }

  return { response: null, requester, supabase, membership };
}

export async function GET(request: Request) {
  const context = await captainMembershipForRequest(request);
  if (context.response) return context.response;

  const { data, error } = await context.supabase
    .from("team_roster_requests")
    .select("id, requested_player_name, requested_player_email, requested_player_note, status, admin_note, created_at")
    .eq("team_season_id", context.membership.team_season_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Žádosti se nepodařilo načíst." }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: Request) {
  const context = await captainMembershipForRequest(request);
  if (context.response) return context.response;

  const body = (await request.json().catch(() => null)) as CreateRosterRequestBody | null;
  const requestedPlayerName = requiredString(body?.requested_player_name);
  const requestedPlayerEmail = optionalString(body?.requested_player_email);
  const requestedPlayerNote = optionalString(body?.requested_player_note);

  if (!requestedPlayerName) {
    return NextResponse.json({ error: "Zadejte jméno hráče." }, { status: 400 });
  }

  if (requestedPlayerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedPlayerEmail)) {
    return NextResponse.json({ error: "Zadejte platný email hráče." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("team_roster_requests")
    .insert({
      season_id: context.membership.season_id,
      team_season_id: context.membership.team_season_id,
      requested_by_user_id: context.requester.userId,
      requested_player_name: requestedPlayerName,
      requested_player_email: requestedPlayerEmail,
      requested_player_note: requestedPlayerNote,
    })
    .select("id, requested_player_name, requested_player_email, requested_player_note, status, admin_note, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
