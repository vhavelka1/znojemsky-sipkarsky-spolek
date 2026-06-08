import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const allowedRoles = new Set(["player", "captain", "moderator", "admin"]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function redirectTo() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  const normalized = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  return `${normalized}/nastavit-heslo`;
}

function schemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("user_profiles")
    ? "Nejprve spusťte SQL soubor supabase/apply_user_profiles_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const [profilesResult, playersResult, usersResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, user_id, player_id, display_name, app_role, is_active, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("players").select("id, display_name, email").is("deleted_at", null).order("display_name"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (profilesResult.error) {
    return NextResponse.json({ error: schemaError(profilesResult.error), users: [], players: [] }, { status: 500 });
  }

  const authUsersById = new Map((usersResult.data?.users ?? []).map((user) => [user.id, user]));

  return NextResponse.json({
    users: (profilesResult.data ?? []).map((profile) => ({
      id: profile.id,
      userId: profile.user_id,
      email: authUsersById.get(profile.user_id)?.email ?? "",
      playerId: profile.player_id,
      displayName: profile.display_name,
      appRole: profile.app_role,
      isActive: profile.is_active,
      createdAt: profile.created_at,
    })),
    players: playersResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const requester = await getCurrentUserProfile(request);
  if (!requester || requester.role !== "admin") {
    return NextResponse.json({ error: "Uživatele může spravovat pouze administrátor." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    display_name?: unknown;
    player_id?: unknown;
    app_role?: unknown;
  };

  const email = stringValue(body.email).toLowerCase();
  const displayName = stringValue(body.display_name);
  const playerId = stringValue(body.player_id);
  const appRole = stringValue(body.app_role) || "player";

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Zadejte platný email." }, { status: 400 });
  }

  if (!displayName) {
    return NextResponse.json({ error: "Zadejte zobrazované jméno." }, { status: 400 });
  }

  if (!allowedRoles.has(appRole)) {
    return NextResponse.json({ error: "Vyberte platnou roli." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const invite = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo(),
  });

  if (invite.error || !invite.data.user) {
    return NextResponse.json({ error: invite.error?.message ?? "Uživatele se nepodařilo pozvat." }, { status: 500 });
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .insert({
      user_id: invite.data.user.id,
      player_id: playerId || null,
      display_name: displayName,
      app_role: appRole,
      is_active: true,
      must_use_mfa: false,
    })
    .select("id, user_id, player_id, display_name, app_role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: schemaError(error) }, { status: 500 });
  }

  if (playerId) {
    await supabase.from("players").update({ user_id: invite.data.user.id, role: appRole }).eq("id", playerId);
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      userId: profile.user_id,
      email,
      playerId: profile.player_id,
      displayName: profile.display_name,
      appRole: profile.app_role,
      isActive: profile.is_active,
      createdAt: profile.created_at,
    },
  });
}
