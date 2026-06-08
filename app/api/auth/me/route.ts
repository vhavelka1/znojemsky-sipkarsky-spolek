import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole } from "@/lib/appAuth";

export async function GET(request: Request) {
  const profile = await getCurrentUserProfile(request).catch(() => null);

  if (!profile) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      displayName: profile.displayName,
      role: profile.role,
      isActive: profile.isActive,
      canAccessAdmin: profile.isActive && hasAtLeastRole(profile.role, "moderator"),
      canManageAdmin: profile.isActive && profile.role === "admin",
    },
  });
}
