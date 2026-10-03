import { NextResponse } from "next/server";
import { authorizeMatchAccess } from "@/lib/matchAccess";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AuditRow = {
  id: string;
  match_id: string;
  game_id: string | null;
  entity_type: string;
  entity_id: string | null;
  field_name: string;
  operation: string;
  old_value: unknown;
  new_value: unknown;
  actor_user_id: string | null;
  actor_player_id: string | null;
  actor_role: string | null;
  actor_team_season_id: string | null;
  source: string;
  request_id: string;
  created_at: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
};

type GameRow = {
  id: string;
  order_number: number;
};

export async function GET(request: Request, context: RouteContext) {
  const { id: matchId } = await context.params;
  const access = await authorizeMatchAccess(request, matchId, { globalMinimumRole: "moderator" });
  if (access.response) {
    return access.response;
  }

  const requestUrl = new URL(request.url);
  const gameId = requestUrl.searchParams.get("game_id");
  const fieldName = requestUrl.searchParams.get("field_name");
  const entityType = requestUrl.searchParams.get("entity_type");
  const actorPlayerId = requestUrl.searchParams.get("actor_player_id");
  const limit = Math.min(200, Math.max(1, Number(requestUrl.searchParams.get("limit") ?? 100) || 100));

  let query = access.supabase
    .from("match_sheet_audit_logs")
    .select("id, match_id, game_id, entity_type, entity_id, field_name, operation, old_value, new_value, actor_user_id, actor_player_id, actor_role, actor_team_season_id, source, request_id, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (gameId) query = query.eq("game_id", gameId);
  if (fieldName) query = query.eq("field_name", fieldName);
  if (entityType) query = query.eq("entity_type", entityType);
  if (actorPlayerId) query = query.eq("actor_player_id", actorPlayerId);

  const { data: auditRows, error } = await query.returns<AuditRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const playerIds = Array.from(new Set((auditRows ?? []).map((row) => row.actor_player_id).filter((value): value is string => Boolean(value))));
  const gameIds = Array.from(new Set((auditRows ?? []).map((row) => row.game_id).filter((value): value is string => Boolean(value))));

  const [playersResult, gamesResult] = await Promise.all([
    playerIds.length > 0
      ? access.supabase.from("players").select("id, display_name").in("id", playerIds).returns<PlayerRow[]>()
      : { data: [] as PlayerRow[], error: null },
    gameIds.length > 0
      ? access.supabase.from("match_games").select("id, order_number").in("id", gameIds).returns<GameRow[]>()
      : { data: [] as GameRow[], error: null },
  ]);

  const lookupError = playersResult.error ?? gamesResult.error;
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const playerById = new Map((playersResult.data ?? []).map((player) => [player.id, player]));
  const gameById = new Map((gamesResult.data ?? []).map((game) => [game.id, game]));

  return NextResponse.json({
    history: (auditRows ?? []).map((row) => ({
      ...row,
      actor_display_name: row.actor_player_id ? playerById.get(row.actor_player_id)?.display_name ?? null : null,
      game_order_number: row.game_id ? gameById.get(row.game_id)?.order_number ?? null : null,
    })),
  });
}
