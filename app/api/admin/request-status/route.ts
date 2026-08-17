import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { loadTournamentRequests } from "@/lib/tournamentRequests";

export async function GET(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) {
    return guard.response;
  }

  const supabase = createSupabaseAdminClient();
  const [rosterRequests, submittedTeamRosters, teamRegistrations, playerRegistrations, tournamentRequests] = await Promise.all([
    supabase
      .from("team_roster_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null),
    supabase
      .from("team_seasons")
      .select("id", { count: "exact", head: true })
      .eq("registration_status", "submitted")
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
    loadTournamentRequests().catch(() => []),
  ]);

  const teamRosterStatusError =
    submittedTeamRosters.error?.message.includes("registration_status") ||
    submittedTeamRosters.error?.message.includes("schema cache")
      ? null
      : submittedTeamRosters.error;
  const error = rosterRequests.error ?? teamRosterStatusError ?? teamRegistrations.error ?? playerRegistrations.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingRosterRequests = (rosterRequests.count ?? 0) + (submittedTeamRosters.error ? 0 : submittedTeamRosters.count ?? 0);
  const pendingRegistrationRequests = (teamRegistrations.count ?? 0) + (playerRegistrations.count ?? 0);

  return NextResponse.json({
    pending: {
      "roster-requests": pendingRosterRequests,
      registrations: pendingRegistrationRequests,
      "tournament-requests": tournamentRequests.filter((request) => request.status === "pending").length,
    },
  });
}
