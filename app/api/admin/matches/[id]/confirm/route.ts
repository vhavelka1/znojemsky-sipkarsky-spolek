import { NextResponse } from "next/server";
import { authorizeMatchAccess } from "@/lib/matchAccess";
import { hasAtLeastRole } from "@/lib/appAuth";

type MatchSide = "home" | "away";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ConfirmBody = {
  side?: unknown;
};

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

function auditSource(role: string | null | undefined) {
  return role === "moderator" || role === "admin" ? "admin_sheet" : "captain_sheet";
}

async function insertConfirmationAudit(
  supabase: Awaited<ReturnType<typeof authorizeMatchAccess>>["supabase"],
  entry: {
    matchId: string;
    entityId?: string | null;
    fieldName: string;
    operation: "confirm" | "unlock" | "status_update";
    oldValue?: unknown;
    newValue?: unknown;
    access: Awaited<ReturnType<typeof authorizeMatchAccess>>;
    requestId: string;
    actorTeamSeasonId?: string | null;
  },
) {
  const { error } = await supabase.from("match_sheet_audit_logs").insert({
    match_id: entry.matchId,
    game_id: null,
    entity_type: entry.operation === "status_update" ? "match" : "match_confirmation",
    entity_id: entry.entityId ?? null,
    field_name: entry.fieldName,
    operation: entry.operation,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    actor_user_id: entry.access.requester?.userId ?? null,
    actor_player_id: entry.access.requester?.playerId ?? null,
    actor_role: entry.access.requester?.role ?? null,
    actor_team_season_id: entry.actorTeamSeasonId ?? null,
    source: auditSource(entry.access.requester?.role),
    request_id: entry.requestId,
  });
  return error;
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const side = parseSide(body?.side);
  if (!side) {
    return NextResponse.json({ error: "Vyberte stranu kapitána." }, { status: 400 });
  }

  const { id: matchId } = await context.params;
  const access = await authorizeMatchAccess(request, matchId, {
    globalMinimumRole: "moderator",
    side,
  });
  if (access.response) {
    return access.response;
  }

  const supabase = access.supabase;
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

  const isModeratorOrAdmin = hasAtLeastRole(access.requester?.role, "moderator");
  const confirmingPlayerId = isModeratorOrAdmin ? null : access.requester?.playerId ?? null;
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

  let confirmationId = existingConfirmation?.id ?? null;
  if (!existingConfirmation) {
    const { data: insertedConfirmation, error } = await supabase.from("match_confirmations").insert({
      match_id: matchId,
      side,
      captain_player_id: confirmingPlayerId ?? captain.player_id,
    }).select("id, match_id, side, captain_player_id, confirmed_at").single();

    if (error) {
      return schemaError(error.message);
    }
    confirmationId = insertedConfirmation?.id ?? null;
    const auditError = await insertConfirmationAudit(supabase, {
      matchId,
      entityId: confirmationId,
      fieldName: `confirmation:${side}`,
      operation: "confirm",
      oldValue: null,
      newValue: insertedConfirmation,
      access,
      requestId,
      actorTeamSeasonId: teamSeasonId,
    });
    if (auditError) {
      return schemaError(auditError.message);
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
  const oldStatus = match.status;
  const nextStatus = isConfirmed ? "confirmed" : "awaiting_confirmation";
  const { error: updateError } = await supabase
    .from("matches")
    .update({ status: nextStatus })
    .eq("id", matchId);

  if (updateError) {
    return schemaError(updateError.message);
  }

  if (oldStatus !== nextStatus) {
    const auditError = await insertConfirmationAudit(supabase, {
      matchId,
      entityId: matchId,
      fieldName: "status",
      operation: "status_update",
      oldValue: oldStatus,
      newValue: nextStatus,
      access,
      requestId,
      actorTeamSeasonId: teamSeasonId,
    });
    if (auditError) {
      return schemaError(auditError.message);
    }
  }

  return NextResponse.json({ status: nextStatus, request_id: requestId });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;
  const side = parseSide(body?.side);
  if (!side) {
    return NextResponse.json({ error: "Vyberte stranu kapitána." }, { status: 400 });
  }

  const { id: matchId } = await context.params;
  const access = await authorizeMatchAccess(request, matchId, {
    globalMinimumRole: "moderator",
  });
  if (access.response) {
    return access.response;
  }

  if (!hasAtLeastRole(access.requester?.role, "moderator")) {
    return NextResponse.json(
      { error: "Odemknout potvrzený zápis může jen moderátor nebo administrátor." },
      { status: 403 },
    );
  }

  const supabase = access.supabase;
  const { data: confirmationBeforeUnlock, error: confirmationBeforeUnlockError } = await supabase
    .from("match_confirmations")
    .select("id, match_id, side, captain_player_id, confirmed_at")
    .eq("match_id", matchId)
    .eq("side", side)
    .is("deleted_at", null)
    .maybeSingle();

  if (confirmationBeforeUnlockError) {
    return schemaError(confirmationBeforeUnlockError.message);
  }

  const { data: matchBeforeUnlock, error: matchBeforeUnlockError } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, status")
    .eq("id", matchId)
    .is("deleted_at", null)
    .single();

  if (matchBeforeUnlockError || !matchBeforeUnlock) {
    return schemaError(matchBeforeUnlockError?.message ?? "Zapas nebyl nalezen.");
  }

  const { error: deleteError } = await supabase
    .from("match_confirmations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("side", side)
    .is("deleted_at", null);

  if (deleteError) {
    return schemaError(deleteError.message);
  }

  if (confirmationBeforeUnlock) {
    const auditError = await insertConfirmationAudit(supabase, {
      matchId,
      entityId: confirmationBeforeUnlock.id,
      fieldName: `confirmation:${side}`,
      operation: "unlock",
      oldValue: confirmationBeforeUnlock,
      newValue: null,
      access,
      requestId,
      actorTeamSeasonId: side === "home" ? matchBeforeUnlock.home_team_id : matchBeforeUnlock.away_team_id,
    });
    if (auditError) {
      return schemaError(auditError.message);
    }
  }

  const { error: updateError } = await supabase
    .from("matches")
    .update({ status: "awaiting_confirmation" })
    .eq("id", matchId)
    .is("deleted_at", null);

  if (updateError) {
    return schemaError(updateError.message);
  }

  if (matchBeforeUnlock.status !== "awaiting_confirmation") {
    const auditError = await insertConfirmationAudit(supabase, {
      matchId,
      entityId: matchId,
      fieldName: "status",
      operation: "status_update",
      oldValue: matchBeforeUnlock.status,
      newValue: "awaiting_confirmation",
      access,
      requestId,
      actorTeamSeasonId: side === "home" ? matchBeforeUnlock.home_team_id : matchBeforeUnlock.away_team_id,
    });
    if (auditError) {
      return schemaError(auditError.message);
    }
  }

  return NextResponse.json({ status: "awaiting_confirmation", request_id: requestId });
}
