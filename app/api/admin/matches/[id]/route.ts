import { NextResponse } from "next/server";
import { requireRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ResetMatchBody = {
  action?: unknown;
};

function guardRequest() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.ENABLE_DEV_ADMIN !== "true"
  ) {
    return NextResponse.json(
      { error: "Administrace zápasů není povolena." },
      { status: 403 },
    );
  }

  if (mockRole !== "admin") {
    return NextResponse.json(
      { error: "Pro tuto akci je potřeba role administrátora." },
      { status: 403 },
    );
  }

  return null;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("matches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ match: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => null)) as ResetMatchBody | null;
  if (body?.action !== "reset_match") {
    return NextResponse.json({ error: "Nepodporovaná akce." }, { status: 400 });
  }

  const auth = await requireRole(request, "admin");
  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  const deletedAt = new Date().toISOString();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (matchError || !match) {
    return NextResponse.json(
      { error: matchError?.message ?? "Zápas nebyl nalezen." },
      { status: 404 },
    );
  }

  const { data: games, error: gamesError } = await supabase
    .from("match_games")
    .select("id")
    .eq("match_id", id)
    .is("deleted_at", null);

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  const gameIds = (games ?? []).map((game) => game.id);

  if (gameIds.length > 0) {
    const { error: playersError } = await supabase
      .from("match_game_players")
      .update({ deleted_at: deletedAt })
      .in("match_game_id", gameIds)
      .is("deleted_at", null);

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 500 });
    }
  }

  const resetQueries = [
    supabase.from("match_game_achievements").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
    supabase.from("match_player_slots").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
    supabase.from("match_confirmations").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
    supabase.from("match_block_lineup_reveals").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
    supabase.from("match_results").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
    supabase.from("match_games").update({ deleted_at: deletedAt }).eq("match_id", id).is("deleted_at", null),
  ];

  const resetResults = await Promise.all(resetQueries);
  const resetError = resetResults.find((result) => result.error)?.error;
  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  const { data: resetMatch, error: resetMatchError } = await supabase
    .from("matches")
    .update({ status: "scheduled", played_at: null })
    .eq("id", id)
    .select("id, status, played_at")
    .single();

  if (resetMatchError) {
    return NextResponse.json({ error: resetMatchError.message }, { status: 500 });
  }

  return NextResponse.json({ match: resetMatch });
}
