import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminPageForAdminApiPath, adminRoleWeight, isAdminRole, type AdminRole } from "@/lib/adminPages";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim();
}

function errorResponse(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = bearerToken(request);

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !token) {
    return errorResponse("Pro přístup do administrace se nejprve přihlaste.", 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse("Přihlášení není platné.", 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });

  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("app_role, is_active")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  let role: AdminRole | undefined = isAdminRole(profile?.app_role ?? "") ? profile?.app_role : undefined;
  let isActive = Boolean(profile?.is_active);

  if (!role) {
    const { data: player } = await adminClient
      .from("players")
      .select("role")
      .eq("user_id", userData.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    role = isAdminRole(player?.role ?? "") ? player?.role : undefined;
    isActive = Boolean(player);
  }

  if (!role || !isActive) {
    return errorResponse("Uživatelský účet není aktivní.", 403);
  }

  const adminPage = adminPageForAdminApiPath(request.nextUrl.pathname);
  let minimumRole: AdminRole = adminPage.defaultMinimumRole;
  const { data: permission } = await adminClient
    .from("admin_page_permissions")
    .select("minimum_role")
    .eq("page_key", adminPage.key)
    .is("deleted_at", null)
    .maybeSingle();

  const configuredMinimumRole = permission?.minimum_role;
  if (configuredMinimumRole && isAdminRole(configuredMinimumRole)) {
    minimumRole = configuredMinimumRole;
  }

  if (adminRoleWeight[role] < adminRoleWeight[minimumRole]) {
    return errorResponse("Pro tuto akci nemáte oprávnění.", 403);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
