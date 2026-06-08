import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AppRole = "player" | "captain" | "moderator" | "admin";

const roleWeight: Record<AppRole, number> = {
  player: 1,
  captain: 2,
  moderator: 3,
  admin: 4,
};

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

  let role = profile?.app_role as AppRole | undefined;
  let isActive = Boolean(profile?.is_active);

  if (!role) {
    const { data: player } = await adminClient
      .from("players")
      .select("role")
      .eq("user_id", userData.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    role = player?.role as AppRole | undefined;
    isActive = Boolean(player);
  }

  if (!role || !isActive) {
    return errorResponse("Uživatelský účet není aktivní.", 403);
  }

  if (roleWeight[role] < roleWeight.admin) {
    return errorResponse("Pro tuto akci je potřeba role administrátora.", 403);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
