import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Server configuration error." },
        { status: 500 },
      ),
    };
  }
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { error: deactivateError } = await supabase
    .from("seasons")
    .update({ is_active: false })
    .eq("is_active", true)
    .is("deleted_at", null);

  if (deactivateError) {
    return NextResponse.json({ error: deactivateError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("seasons")
    .update({ is_active: true })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, starts_on, ends_on, transfer_deadline_on, transfer_wait_days, is_active, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ season: data });
}
