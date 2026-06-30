import { NextResponse } from "next/server";
import { requireModeratorOrAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type Body = {
  action?: unknown;
  admin_note?: unknown;
};

const actions = {
  approve: "approved",
  return: "returned",
  cancel: "cancelled",
  draft: "draft",
} as const;

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isMissingTeamSeasonRegistrationColumn(message: string | undefined) {
  return Boolean(
    message &&
      (message.includes("schema cache") || message.includes("Could not find")) &&
      (message.includes("registration_status") ||
        message.includes("registration_reviewed_at") ||
        message.includes("registration_reviewed_by_user_id") ||
        message.includes("registration_admin_note")),
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const guard = await requireModeratorOrAdmin(request);
  if (guard.response) return guard.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const action = optionalString(body?.action);
  const status = action && action in actions ? actions[action as keyof typeof actions] : null;

  if (!status) {
    return NextResponse.json({ error: "Vyberte platnou akci." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("team_seasons")
    .update({
      registration_status: status,
      registration_reviewed_at: new Date().toISOString(),
      registration_reviewed_by_user_id: guard.profile?.userId ?? null,
      registration_admin_note: optionalString(body?.admin_note),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (isMissingTeamSeasonRegistrationColumn(error?.message)) {
    return NextResponse.json(
      {
        error:
          "V databázi chybí sloupce pro schvalování účasti. Spusťte SQL soubor supabase/apply_team_season_registration_status_in_dashboard.sql.",
      },
      { status: 500 },
    );
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
