import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type MatchSide = "home" | "away";
type RequestStatus = "opponent_pending" | "pending" | "approved" | "rejected" | "cancelled";

type ReviewBody = {
  id?: unknown;
  action?: unknown;
  opponent_review_note?: unknown;
};

type RescheduleRequestRow = {
  id: string;
  match_id: string;
  requested_by_side: MatchSide | null;
  status: RequestStatus;
};

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
};

type MembershipRow = {
  team_season_id: string;
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

function oppositeSide(side: MatchSide): MatchSide {
  return side === "home" ? "away" : "home";
}

function sideForMembership(match: MatchRow, membership: MembershipRow): MatchSide | null {
  if (membership.team_season_id === match.home_team_id) return "home";
  if (membership.team_season_id === match.away_team_id) return "away";
  return null;
}

function schemaError(message: string) {
  return NextResponse.json(
    {
      error: message.includes("match_reschedule_requests") || message.includes("schema cache")
        ? "Žádosti o změnu termínu nejsou aktualizované. Spusťte SQL soubor supabase/apply_match_reschedule_opponent_approval_in_dashboard.sql v Supabase SQL Editoru."
        : message,
    },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return NextResponse.json({ error: "Pro tuto akci se nejprve prihlaste." }, { status: 401 });
  }

  if (!requester.playerId) {
    return NextResponse.json({ error: "Uzivatel neni propojeny s hracem." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  const id = requiredString(body?.id);
  const action = requiredString(body?.action);
  const opponentReviewNote = optionalString(body?.opponent_review_note);

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Vyberte zadost a platnou akci." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: rescheduleRequest, error: requestError } = await supabase
    .from("match_reschedule_requests")
    .select("id, match_id, requested_by_side, status")
    .eq("id", id)
    .is("deleted_at", null)
    .single<RescheduleRequestRow>();

  if (requestError || !rescheduleRequest) {
    return schemaError(requestError?.message ?? "Žádost nebyla nalezena.");
  }

  if (rescheduleRequest.status !== "opponent_pending") {
    return NextResponse.json({ error: "Tato žádost už není ve stavu čekání na soupeře." }, { status: 400 });
  }

  if (!rescheduleRequest.requested_by_side) {
    return NextResponse.json({ error: "U zadosti chybi strana zadatele." }, { status: 400 });
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .eq("id", rescheduleRequest.match_id)
    .is("deleted_at", null)
    .single<MatchRow>();

  if (matchError || !match) {
    return schemaError(matchError?.message ?? "Zapas nebyl nalezen.");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("team_season_id")
    .eq("player_id", requester.playerId)
    .in("team_season_id", [match.home_team_id, match.away_team_id])
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .returns<MembershipRow[]>();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const reviewerSide = (memberships ?? [])
    .map((membership) => sideForMembership(match, membership))
    .find((side): side is MatchSide => Boolean(side));
  if (reviewerSide !== oppositeSide(rescheduleRequest.requested_by_side)) {
    return NextResponse.json({ error: "Tuto žádost může potvrdit jen kapitán nebo zástupce soupeře." }, { status: 403 });
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("match_reschedule_requests")
    .update({
      status: action === "approve" ? "pending" : "rejected",
      opponent_reviewed_by_user_id: requester.userId,
      opponent_reviewed_at: reviewedAt,
      opponent_review_note: opponentReviewNote,
    })
    .eq("id", id)
    .eq("status", "opponent_pending")
    .is("deleted_at", null);

  if (updateError) {
    return schemaError(updateError.message);
  }

  return NextResponse.json({ ok: true });
}
