import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  let profile;
  try {
    profile = await getCurrentUserProfile(request);
  } catch {
    return NextResponse.json({ error: "Načítání účtu je dočasně nedostupné. Zkuste to za chvíli znovu." }, { status: 503 });
  }

  if (!profile) {
    return NextResponse.json({ user: null });
  }

  let canManageOwnTeam = false;
  if (profile.isActive && profile.playerId) {
    const supabase = createSupabaseAdminClient();
    const { data: leadershipMemberships, error: membershipError } = await supabase
      .from("team_memberships")
      .select("id")
      .eq("player_id", profile.playerId)
      .in("member_role", ["captain", "assistant_captain"])
      .is("left_on", null)
      .is("deleted_at", null)
      .limit(1)
      .abortSignal(AbortSignal.timeout(8000))
      .returns<Array<{ id: string }>>();
    if (membershipError) {
      return NextResponse.json({ error: "Načítání oprávnění je dočasně nedostupné. Zkuste to za chvíli znovu." }, { status: 503 });
    }
    canManageOwnTeam = Boolean(leadershipMemberships?.[0]);
  }

  return NextResponse.json({
    user: {
      displayName: profile.displayName,
      role: profile.role,
      isActive: profile.isActive,
      canAccessAdmin: profile.isActive && (hasAtLeastRole(profile.role, "moderator") || canManageOwnTeam),
      canManageAdmin: profile.isActive && profile.role === "admin",
      canManageOwnTeam,
    },
  });
}
