import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole, requireModeratorOrAdmin } from "@/lib/appAuth";
import { authorizeMatchAccess, type MatchSide } from "@/lib/matchAccess";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type CreateBody = {
  match_id?: unknown;
  requested_scheduled_at?: unknown;
  reason?: unknown;
};

type ReviewBody = {
  id?: unknown;
  action?: unknown;
  review_note?: unknown;
};

type MatchRow = {
  id: string;
  season_id: string;
  league_id: string;
  group_id: string;
  home_team_id: string;
  away_team_id: string;
  round_number: number | null;
  scheduled_at: string;
};

type RescheduleRequestRow = {
  id: string;
  match_id: string;
  requested_by_user_id: string;
  requested_by_player_id: string | null;
  requested_by_side: MatchSide | null;
  current_scheduled_at: string;
  requested_scheduled_at: string;
  reason: string;
  status: RequestStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  display_name: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type NamedRow = {
  id: string;
  name: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
};

function requiredString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseScheduledAt(value: unknown) {
  const raw = requiredString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function schemaError(message: string) {
  return NextResponse.json(
    {
      error: message.includes("match_reschedule_requests") || message.includes("schema cache")
        ? "Žádosti o změnu termínu zatím nejsou vytvořené. Spusťte SQL soubor supabase/apply_match_reschedule_requests_in_dashboard.sql v Supabase SQL Editoru."
        : message,
    },
    { status: 500 },
  );
}

async function requesterSideForMatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  match: Pick<MatchRow, "home_team_id" | "away_team_id">,
  playerId: string,
) {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("team_season_id")
    .eq("player_id", playerId)
    .in("team_season_id", [match.home_team_id, match.away_team_id])
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .returns<Array<{ team_season_id: string }>>();

  if (error) {
    return { side: null, error };
  }

  const membership = data?.[0];
  if (!membership) {
    return { side: null, error: null };
  }

  return {
    side: membership.team_season_id === match.home_team_id ? "home" as const : "away" as const,
    error: null,
  };
}

async function loadRequests(supabase: ReturnType<typeof createSupabaseAdminClient>, matchId?: string) {
  const requests = await supabase
    .from("match_reschedule_requests")
    .select("id, match_id, requested_by_user_id, requested_by_player_id, requested_by_side, current_scheduled_at, requested_scheduled_at, reason, status, reviewed_by_user_id, reviewed_at, review_note, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<RescheduleRequestRow[]>();

  if (requests.error) {
    return { data: null, error: requests.error };
  }

  const filteredRequests = matchId
    ? (requests.data ?? []).filter((request) => request.match_id === matchId)
    : requests.data ?? [];
  const matchIds = [...new Set(filteredRequests.map((request) => request.match_id))];

  if (matchIds.length === 0) {
    return { data: [], error: null };
  }

  const [matches, teamSeasons, teams, seasons, leagues, groups, players] = await Promise.all([
    supabase
      .from("matches")
      .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at")
      .in("id", matchIds)
      .is("deleted_at", null)
      .returns<MatchRow[]>(),
    supabase.from("team_seasons").select("id, team_id, display_name").is("deleted_at", null).returns<TeamSeasonRow[]>(),
    supabase.from("teams").select("id, name").is("deleted_at", null).returns<TeamRow[]>(),
    supabase.from("seasons").select("id, name").is("deleted_at", null).returns<NamedRow[]>(),
    supabase.from("leagues").select("id, name").is("deleted_at", null).returns<NamedRow[]>(),
    supabase.from("league_groups").select("id, name").is("deleted_at", null).returns<NamedRow[]>(),
    supabase.from("players").select("id, display_name").is("deleted_at", null).returns<PlayerRow[]>(),
  ]);

  const error = matches.error ?? teamSeasons.error ?? teams.error ?? seasons.error ?? leagues.error ?? groups.error ?? players.error;
  if (error) {
    return { data: null, error };
  }

  const matchById = new Map((matches.data ?? []).map((match) => [match.id, match]));
  const teamSeasonById = new Map((teamSeasons.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
  const teamById = new Map((teams.data ?? []).map((team) => [team.id, team]));
  const seasonById = new Map((seasons.data ?? []).map((season) => [season.id, season]));
  const leagueById = new Map((leagues.data ?? []).map((league) => [league.id, league]));
  const groupById = new Map((groups.data ?? []).map((group) => [group.id, group]));
  const playerById = new Map((players.data ?? []).map((player) => [player.id, player]));

  const data = filteredRequests.map((request) => {
    const match = matchById.get(request.match_id);
    const homeTeamSeason = match ? teamSeasonById.get(match.home_team_id) : null;
    const awayTeamSeason = match ? teamSeasonById.get(match.away_team_id) : null;
    const homeTeam = homeTeamSeason ? teamById.get(homeTeamSeason.team_id) : null;
    const awayTeam = awayTeamSeason ? teamById.get(awayTeamSeason.team_id) : null;

    return {
      ...request,
      match: match
        ? {
            ...match,
            homeTeamName: homeTeamSeason?.display_name || homeTeam?.name || "Domácí",
            awayTeamName: awayTeamSeason?.display_name || awayTeam?.name || "Hosté",
            seasonName: seasonById.get(match.season_id)?.name || "Sezóna",
            leagueName: leagueById.get(match.league_id)?.name || "Liga",
            groupName: groupById.get(match.group_id)?.name || "Skupina",
          }
        : null,
      requestedByName: request.requested_by_player_id
        ? playerById.get(request.requested_by_player_id)?.display_name ?? "Hráč"
        : "Administrace",
    };
  });

  return { data, error: null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = optionalString(url.searchParams.get("match_id"));
  const supabase = createSupabaseAdminClient();

  if (matchId) {
    const access = await authorizeMatchAccess(request, matchId, { globalMinimumRole: "moderator" });
    if (access.response) return access.response;

    const { data, error } = await loadRequests(supabase, matchId);
    if (error) return schemaError(error.message);
    return NextResponse.json({ requests: data });
  }

  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  const { data, error } = await loadRequests(supabase);
  if (error) return schemaError(error.message);

  return NextResponse.json({ requests: data });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const matchId = requiredString(body?.match_id);
  const requestedScheduledAt = parseScheduledAt(body?.requested_scheduled_at);
  const reason = requiredString(body?.reason);

  if (!matchId || !requestedScheduledAt || !reason) {
    return NextResponse.json({ error: "Vyberte nový termín a uveďte důvod změny." }, { status: 400 });
  }

  const access = await authorizeMatchAccess(request, matchId, { globalMinimumRole: "moderator" });
  if (access.response) return access.response;

  const requester = await getCurrentUserProfile(request);
  if (!requester?.isActive) {
    return NextResponse.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 });
  }

  const supabase = access.supabase;
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, season_id, league_id, group_id, home_team_id, away_team_id, round_number, scheduled_at")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single<MatchRow>();

  if (matchError || !match) {
    return schemaError(matchError?.message ?? "Zápas nebyl nalezen.");
  }

  const isModeratorOrAdmin = hasAtLeastRole(requester.role, "moderator");
  const sideResult = requester.playerId && !isModeratorOrAdmin
    ? await requesterSideForMatch(supabase, match, requester.playerId)
    : { side: null, error: null };

  if (sideResult.error) {
    return NextResponse.json({ error: sideResult.error.message }, { status: 500 });
  }

  const { data: pendingRequest, error: pendingError } = await supabase
    .from("match_reschedule_requests")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (pendingError) {
    return schemaError(pendingError.message);
  }

  if (pendingRequest) {
    return NextResponse.json(
      { error: "U tohoto zápasu už čeká žádost o změnu termínu." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("match_reschedule_requests")
    .insert({
      match_id: matchId,
      requested_by_user_id: requester.userId,
      requested_by_player_id: requester.playerId,
      requested_by_side: sideResult.side,
      current_scheduled_at: match.scheduled_at,
      requested_scheduled_at: requestedScheduledAt,
      reason,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return schemaError(error.message);
  }

  return NextResponse.json({ request: data });
}

export async function PATCH(request: Request) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  const id = requiredString(body?.id);
  const action = requiredString(body?.action);
  const reviewNote = optionalString(body?.review_note);

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Vyberte žádost a platnou akci." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: rescheduleRequest, error: requestError } = await supabase
    .from("match_reschedule_requests")
    .select("id, match_id, requested_scheduled_at, status")
    .eq("id", id)
    .is("deleted_at", null)
    .single<Pick<RescheduleRequestRow, "id" | "match_id" | "requested_scheduled_at" | "status">>();

  if (requestError || !rescheduleRequest) {
    return schemaError(requestError?.message ?? "Žádost nebyla nalezena.");
  }

  if (rescheduleRequest.status !== "pending") {
    return NextResponse.json({ error: "Tato žádost už byla zpracována." }, { status: 400 });
  }

  const reviewedAt = new Date().toISOString();
  if (action === "approve") {
    const { error: matchError } = await supabase
      .from("matches")
      .update({ scheduled_at: rescheduleRequest.requested_scheduled_at })
      .eq("id", rescheduleRequest.match_id)
      .is("deleted_at", null);

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabase
    .from("match_reschedule_requests")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by_user_id: guard.profile!.userId,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (updateError) {
    return schemaError(updateError.message);
  }

  if (action === "approve") {
    const { error: rejectOthersError } = await supabase
      .from("match_reschedule_requests")
      .update({
        status: "rejected",
        reviewed_by_user_id: guard.profile!.userId,
        reviewed_at: reviewedAt,
        review_note: "Nahrazeno schválenou změnou termínu.",
      })
      .eq("match_id", rescheduleRequest.match_id)
      .eq("status", "pending")
      .neq("id", id)
      .is("deleted_at", null);

    if (rejectOthersError) {
      return schemaError(rejectOthersError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
