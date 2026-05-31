import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function guardRequest() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Administrace zápasů je dostupná pouze ve vývojovém režimu." },
      { status: 404 },
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

