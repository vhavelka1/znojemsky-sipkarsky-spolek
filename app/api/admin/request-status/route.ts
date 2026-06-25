import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) {
    return guard.response;
  }

  const supabase = createSupabaseAdminClient();
  const [rosterRequests, teamRegistrations, playerRegistrations] = await Promise.all([
    supabase
      .from("team_roster_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null),
    supabase
      .from("team_registration_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null),
    supabase
      .from("player_registration_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null),
  ]);

  const error = rosterRequests.error ?? teamRegistrations.error ?? playerRegistrations.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingRosterRequests = rosterRequests.count ?? 0;
  const pendingRegistrationRequests = (teamRegistrations.count ?? 0) + (playerRegistrations.count ?? 0);

  return NextResponse.json({
    pending: {
      "roster-requests": pendingRosterRequests,
      registrations: pendingRegistrationRequests,
    },
  });
}
