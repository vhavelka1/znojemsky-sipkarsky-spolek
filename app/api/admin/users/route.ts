import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { passwordSetupRedirectTo } from "@/lib/siteUrl";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const allowedRoles = new Set(["player", "moderator", "admin"]);

type PlayerRow = {
  id: string;
  display_name: string;
  email: string | null;
};

type SeasonRow = {
  id: string;
  is_active: boolean;
  starts_on: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type MembershipRow = {
  player_id: string;
  season_id: string;
  team_season_id: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function schemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("user_profiles")
    ? "Nejprve spusťte SQL soubor supabase/apply_user_profiles_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const [profilesResult, playersResult, usersResult, seasonsResult, teamsResult, teamSeasonsResult, membershipsResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, user_id, player_id, display_name, app_role, is_active, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("players").select("id, display_name, email").is("deleted_at", null).order("display_name").returns<PlayerRow[]>(),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("seasons")
      .select("id, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .returns<SeasonRow[]>(),
    supabase.from("teams").select("id, name").is("deleted_at", null).returns<TeamRow[]>(),
    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name")
      .is("deleted_at", null)
      .returns<TeamSeasonRow[]>(),
    supabase
      .from("team_memberships")
      .select("player_id, season_id, team_season_id")
      .is("deleted_at", null)
      .is("left_on", null)
      .returns<MembershipRow[]>(),
  ]);

  if (profilesResult.error) {
    return NextResponse.json({ error: schemaError(profilesResult.error), users: [], players: [] }, { status: 500 });
  }

  const authUsersById = new Map((usersResult.data?.users ?? []).map((user) => [user.id, user]));
  const activeSeasonId =
    (seasonsResult.data ?? []).find((season) => season.is_active)?.id ??
    seasonsResult.data?.[0]?.id ??
    "";
  const teamById = new Map((teamsResult.data ?? []).map((team) => [team.id, team]));
  const teamSeasonById = new Map((teamSeasonsResult.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
  const teamNamesByPlayerId = new Map<string, Set<string>>();

  for (const membership of membershipsResult.data ?? []) {
    if (activeSeasonId && membership.season_id !== activeSeasonId) continue;

    const teamSeason = teamSeasonById.get(membership.team_season_id);
    const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
    const teamName = teamSeason?.display_name || team?.name;
    if (!teamName) continue;

    const playerTeamNames = teamNamesByPlayerId.get(membership.player_id) ?? new Set<string>();
    playerTeamNames.add(teamName);
    teamNamesByPlayerId.set(membership.player_id, playerTeamNames);
  }

  function playerTeamNames(playerId: string | null) {
    return [...(playerId ? teamNamesByPlayerId.get(playerId) ?? [] : [])].sort((a, b) => a.localeCompare(b, "cs"));
  }

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
      teamNames: playerTeamNames(profile.player_id),
    })),
    players: (playersResult.data ?? []).map((player) => ({
      ...player,
      teamNames: playerTeamNames(player.id),
    })),
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
    redirectTo: passwordSetupRedirectTo(request),
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
      teamNames: [],
    },
  });
}
