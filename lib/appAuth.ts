import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type AppRole = "guest" | "player" | "moderator" | "admin";

export type AppRequester = {
  userId: string;
  playerId: string | null;
  displayName: string;
  role: AppRole;
  profileId: string | null;
  isActive: boolean;
};

const roleWeight: Record<AppRole, number> = {
  guest: 0,
  player: 1,
  moderator: 2,
  admin: 3,
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim();
}

export function hasAtLeastRole(role: AppRole | null | undefined, minimumRole: AppRole) {
  if (!role) return false;
  return roleWeight[role] >= roleWeight[minimumRole];
}

export async function getAppRequester(request: Request): Promise<AppRequester | null> {
  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !anonKey) {
    return null;
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
    return null;
  }

  const adminClient = createSupabaseAdminClient();
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("id, player_id, display_name, app_role, is_active")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (profile) {
    return {
      userId: userData.user.id,
      playerId: profile.player_id ?? null,
      displayName: profile.display_name,
      role: profile.app_role as AppRole,
      profileId: profile.id,
      isActive: Boolean(profile.is_active),
    };
  }

  const { data: player } = await adminClient
    .from("players")
    .select("id, display_name, role")
    .eq("user_id", userData.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!player) {
    return null;
  }

  return {
    userId: userData.user.id,
    playerId: player.id,
    displayName: player.display_name,
    role: player.role as AppRole,
    profileId: null,
    isActive: true,
  };
}

export async function getCurrentUserProfile(request: Request) {
  return getAppRequester(request);
}

export async function requireRole(request: Request, minimumRole: AppRole) {
  const profile = await getCurrentUserProfile(request);

  if (!profile) {
    return {
      profile: null,
      response: Response.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 }),
    };
  }

  if (!profile.isActive) {
    return {
      profile,
      response: Response.json({ error: "Uživatelský účet je deaktivovaný." }, { status: 403 }),
    };
  }

  if (!hasAtLeastRole(profile.role, minimumRole)) {
    return {
      profile,
      response: Response.json({ error: "Pro tuto akci nemáte oprávnění." }, { status: 403 }),
    };
  }

  return { profile, response: null };
}

export function requireAdmin(request: Request) {
  return requireRole(request, "admin");
}

export function requireModeratorOrAdmin(request: Request) {
  return requireRole(request, "moderator");
}
