import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type CreateRosterRequestBody = {
  request_mode?: unknown;
  existing_player_id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  requested_player_name?: unknown;
  requested_player_email?: unknown;
  requested_player_phone?: unknown;
  requested_player_residence?: unknown;
  requested_player_date_of_birth?: unknown;
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

function optionalEmail(value: unknown) {
  const email = optionalString(value);
  return email ? email.toLowerCase() : null;
}

function optionalDate(value: unknown) {
  const text = optionalString(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function optionalUuid(value: unknown) {
  const text = optionalString(value);
  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
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
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !membership) {
    return {
      response: NextResponse.json({ error: "Žádosti může odesílat pouze kapitán nebo zástupce kapitána týmu." }, { status: 403 }),
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
    .select("id, requested_player_id, requested_player_name, requested_player_email, requested_player_phone, requested_player_residence, requested_player_date_of_birth, requested_player_note, status, admin_note, created_at")
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
  const requestMode = optionalString(body?.request_mode) === "existing" ? "existing" : "new";
  const existingPlayerId = optionalUuid(body?.existing_player_id);
  const firstName = requiredString(body?.first_name);
  const lastName = requiredString(body?.last_name);
  const requestedPlayerName = requestMode === "existing"
    ? requiredString(body?.requested_player_name)
    : [firstName, lastName].filter(Boolean).join(" ").trim();
  const requestedPlayerEmail = optionalEmail(body?.requested_player_email);
  const requestedPlayerPhone = optionalString(body?.requested_player_phone);
  const requestedPlayerResidence = optionalString(body?.requested_player_residence);
  const requestedPlayerDateOfBirth = optionalDate(body?.requested_player_date_of_birth);
  const requestedPlayerNote = optionalString(body?.requested_player_note);

  if (requestMode === "existing" && !existingPlayerId) {
    return NextResponse.json({ error: "Vyberte hráče ze seznamu." }, { status: 400 });
  }

  if (requestMode === "new" && (!firstName || !lastName || !requestedPlayerEmail || !requestedPlayerResidence || !requestedPlayerDateOfBirth)) {
    return NextResponse.json({ error: "Vyplňte jméno, příjmení, email, bydliště a datum narození hráče." }, { status: 400 });
  }

  if (requestedPlayerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedPlayerEmail)) {
    return NextResponse.json({ error: "Zadejte platný email hráče." }, { status: 400 });
  }

  let existingPlayerName = requestedPlayerName;
  let existingPlayerEmail = requestedPlayerEmail;
  let existingPlayerPhone = requestedPlayerPhone;
  let existingPlayerResidence = requestedPlayerResidence;
  let existingPlayerDateOfBirth = requestedPlayerDateOfBirth;

  if (requestMode === "existing") {
    const { data: player, error: playerError } = await context.supabase
      .from("players")
      .select("id, display_name, email, phone, residence, date_of_birth")
      .eq("id", existingPlayerId)
      .is("deleted_at", null)
      .single<{
        id: string;
        display_name: string;
        email: string | null;
        phone: string | null;
        residence: string | null;
        date_of_birth: string | null;
      }>();

    if (playerError || !player) {
      return NextResponse.json({ error: "Vybraný hráč nebyl nalezen." }, { status: 404 });
    }

    const { data: activeMembership, error: membershipError } = await context.supabase
      .from("team_memberships")
      .select("id")
      .eq("player_id", player.id)
      .eq("season_id", context.membership.season_id)
      .is("left_on", null)
      .is("deleted_at", null)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (activeMembership) {
      return NextResponse.json({ error: "Vybraný hráč už je v této sezóně přiřazený k týmu." }, { status: 400 });
    }

    existingPlayerName = player.display_name;
    existingPlayerEmail = player.email;
    existingPlayerPhone = player.phone;
    existingPlayerResidence = player.residence;
    existingPlayerDateOfBirth = player.date_of_birth;
  }

  const { data, error } = await context.supabase
    .from("team_roster_requests")
    .insert({
      season_id: context.membership.season_id,
      team_season_id: context.membership.team_season_id,
      requested_by_user_id: context.requester.userId,
      requested_player_id: requestMode === "existing" ? existingPlayerId : null,
      requested_player_name: existingPlayerName,
      requested_player_email: existingPlayerEmail,
      requested_player_phone: existingPlayerPhone,
      requested_player_residence: existingPlayerResidence,
      requested_player_date_of_birth: existingPlayerDateOfBirth,
      requested_player_note: requestedPlayerNote,
    })
    .select("id, requested_player_id, requested_player_name, requested_player_email, requested_player_phone, requested_player_residence, requested_player_date_of_birth, requested_player_note, status, admin_note, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
