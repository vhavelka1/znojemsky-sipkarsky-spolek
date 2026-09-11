import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole, type AppRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type MatchSide = "home" | "away";

type MatchAccessRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
};

type CaptainMembershipRow = {
  player_id: string;
  team_season_id: string;
  member_role: "captain" | "assistant_captain";
};

export async function authorizeMatchAccess(
  request: Request,
  matchId: string,
  options: { globalMinimumRole?: AppRole; side?: MatchSide } = {},
) {
  const supabase = createSupabaseAdminClient();

  if (process.env.ENABLE_DEV_ADMIN === "true") {
    return { supabase, requester: null, match: null as MatchAccessRow | null, response: null };
  }

  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return {
      supabase,
      requester,
      match: null,
      response: NextResponse.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 }),
    };
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single<MatchAccessRow>();

  if (matchError || !match) {
    return {
      supabase,
      requester,
      match: null,
      response: NextResponse.json({ error: matchError?.message ?? "Zápas nebyl nalezen." }, { status: 404 }),
    };
  }

  if (hasAtLeastRole(requester.role, options.globalMinimumRole ?? "admin")) {
    return { supabase, requester, match, response: null };
  }

  if (!requester.playerId) {
    return {
      supabase,
      requester,
      match,
      response: NextResponse.json({ error: "Uživatel není propojený s hráčem." }, { status: 403 }),
    };
  }

  const allowedTeamSeasonIds =
    options.side === "home"
      ? [match.home_team_id]
      : options.side === "away"
        ? [match.away_team_id]
        : [match.home_team_id, match.away_team_id];

  const { data: memberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("player_id, team_season_id, member_role")
    .eq("player_id", requester.playerId)
    .in("team_season_id", allowedTeamSeasonIds)
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .returns<CaptainMembershipRow[]>();

  if (membershipError) {
    return {
      supabase,
      requester,
      match,
      response: NextResponse.json({ error: membershipError.message }, { status: 500 }),
    };
  }

  if ((memberships ?? []).length === 0) {
    return {
      supabase,
      requester,
      match,
      response: NextResponse.json(
        { error: "Tento zápas může upravovat jen administrátor, kapitán nebo zástupce daného týmu." },
        { status: 403 },
      ),
    };
  }

  return { supabase, requester, match, response: null };
}
