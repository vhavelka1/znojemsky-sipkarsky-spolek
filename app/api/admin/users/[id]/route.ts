import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { passwordSetupRedirectTo } from "@/lib/siteUrl";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const allowedRoles = new Set(["player", "captain", "moderator", "admin"]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function schemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("user_profiles")
    ? "Nejprve spusťte SQL soubor supabase/apply_user_profiles_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await getCurrentUserProfile(request);
  if (!requester || requester.role !== "admin") {
    return NextResponse.json({ error: "Uživatele může spravovat pouze administrátor." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    player_id?: unknown;
    display_name?: unknown;
    app_role?: unknown;
    is_active?: unknown;
  };
  const supabase = createSupabaseAdminClient();
  const { data: currentProfile, error: currentError } = await supabase
    .from("user_profiles")
    .select("id, user_id, app_role")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (currentError) {
    return NextResponse.json({ error: schemaError(currentError) }, { status: 404 });
  }

  const appRole = stringValue(body.app_role) || currentProfile.app_role;
  if (!allowedRoles.has(appRole)) {
    return NextResponse.json({ error: "Vyberte platnou roli." }, { status: 400 });
  }

  if (requester.userId === currentProfile.user_id && appRole !== currentProfile.app_role) {
    return NextResponse.json({ error: "Vlastní roli si nemůžete změnit." }, { status: 400 });
  }

  const update = {
    player_id: optionalString(body.player_id),
    display_name: stringValue(body.display_name),
    app_role: appRole,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    must_use_mfa: false,
  };

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .update(update)
    .eq("id", id)
    .select("id, user_id, player_id, display_name, app_role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: schemaError(error) }, { status: 500 });
  }

  if (profile.player_id) {
    await supabase.from("players").update({ user_id: profile.user_id, role: profile.app_role }).eq("id", profile.player_id);
  }

  return NextResponse.json({ user: profile });
}

export async function POST(request: Request, context: RouteContext) {
  const requester = await getCurrentUserProfile(request);
  if (!requester || requester.role !== "admin") {
    return NextResponse.json({ error: "Uživatele může spravovat pouze administrátor." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = stringValue(body.action);
  const supabase = createSupabaseAdminClient();

  if (action !== "password_reset") {
    return NextResponse.json({ error: "Neznámá akce." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (profileError) {
    return NextResponse.json({ error: schemaError(profileError) }, { status: 404 });
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(profile.user_id);
  if (userError || !userData.user.email) {
    return NextResponse.json({ error: "Email uživatele se nepodařilo najít." }, { status: 500 });
  }

  const reset = await supabase.auth.resetPasswordForEmail(userData.user.email, {
    redirectTo: passwordSetupRedirectTo(request),
  });

  if (reset.error) {
    return NextResponse.json({ error: "Obnovu hesla se nepodařilo odeslat." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
