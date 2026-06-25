import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const profile = await getCurrentUserProfile(request).catch(() => null);

  if (!profile) {
    return NextResponse.json({ user: null });
  }

  let canManageOwnTeam = false;
  if (profile.isActive && profile.playerId) {
    const supabase = createSupabaseAdminClient();
    const { data: leadershipMembership } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("player_id", profile.playerId)
      .in("member_role", ["captain", "assistant_captain"])
      .is("left_on", null)
      .is("deleted_at", null)
      .maybeSingle();
    canManageOwnTeam = Boolean(leadershipMembership);
  }

  return NextResponse.json({
    user: {
      displayName: profile.displayName,
      role: profile.role,
      isActive: profile.isActive,
      canAccessAdmin: profile.isActive && hasAtLeastRole(profile.role, "moderator"),
      canManageAdmin: profile.isActive && profile.role === "admin",
      canManageOwnTeam,
    },
  });
}
