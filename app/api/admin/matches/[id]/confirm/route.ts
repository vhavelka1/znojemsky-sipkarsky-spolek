import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type MatchSide = "home" | "away";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ConfirmBody = {
  side?: unknown;
};

function guardRequest() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.ENABLE_DEV_ADMIN !== "true"
  ) {
    return NextResponse.json(
      { error: "Potvrzení zápisu není povoleno." },
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

function parseSide(value: unknown): MatchSide | null {
  return value === "home" || value === "away" ? value : null;
}

function schemaError(message: string) {
  return NextResponse.json(
    {
      error: message.includes("match_confirmations") || message.includes("awaiting_confirmation")
        ? "Nejprve spusťte SQL soubor supabase/apply_match_captain_confirmations_in_dashboard.sql v Supabase SQL Editoru."
        : message,
    },
    { status: 500 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const side = parseSide(body?.side);
  if (!side) {
    return NextResponse.json({ error: "Vyberte stranu kapitána." }, { status: 400 });
  }

  const { id: matchId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, status")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single();

  if (matchError || !match) {
    return schemaError(matchError?.message ?? "Zápas nebyl nalezen.");
  }

  if (!["awaiting_confirmation", "confirmed"].includes(match.status)) {
    return NextResponse.json(
      { error: "Nejprve dokončete a uložte celý zápis utkání." },
      { status: 400 },
    );
  }

  const teamSeasonId = side === "home" ? match.home_team_id : match.away_team_id;
  const { data: captain, error: captainError } = await supabase
    .from("team_memberships")
    .select("player_id")
    .eq("team_season_id", teamSeasonId)
    .eq("member_role", "captain")
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (captainError) {
    return schemaError(captainError.message);
  }

  if (!captain) {
    return NextResponse.json(
      { error: "Tým zatím nemá nastaveného kapitána. Nastavte jej ve správě členství." },
      { status: 400 },
    );
  }

  const { data: existingConfirmation, error: confirmationLookupError } = await supabase
    .from("match_confirmations")
    .select("id")
    .eq("match_id", matchId)
    .eq("side", side)
    .is("deleted_at", null)
    .maybeSingle();

  if (confirmationLookupError) {
    return schemaError(confirmationLookupError.message);
  }

  if (!existingConfirmation) {
    const { error } = await supabase.from("match_confirmations").insert({
      match_id: matchId,
      side,
      captain_player_id: captain.player_id,
    });

    if (error) {
      return schemaError(error.message);
    }
  }

  const { data: confirmations, error: confirmationsError } = await supabase
    .from("match_confirmations")
    .select("side")
    .eq("match_id", matchId)
    .is("deleted_at", null);

  if (confirmationsError) {
    return schemaError(confirmationsError.message);
  }

  const confirmedSides = new Set((confirmations ?? []).map((confirmation) => confirmation.side));
  const isConfirmed = confirmedSides.has("home") && confirmedSides.has("away");
  const { error: updateError } = await supabase
    .from("matches")
    .update({ status: isConfirmed ? "confirmed" : "awaiting_confirmation" })
    .eq("id", matchId);

  if (updateError) {
    return schemaError(updateError.message);
  }

  return NextResponse.json({ status: isConfirmed ? "confirmed" : "awaiting_confirmation" });
}
