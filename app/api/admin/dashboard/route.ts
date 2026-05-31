import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

function developmentOnlyResponse() {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  return NextResponse.json(
    { error: "Development-only admin API route." },
    { status: 404 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json({ error: "Admin role required." }, { status: 403 });
}

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

export async function GET() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) {
    return developmentResponse;
  }

  const adminResponse = mockAdminResponse();
  if (adminResponse) {
    return adminResponse;
  }

  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const [players, teams, seasons, memberships] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("teams").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("seasons").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  const error = players.error ?? teams.error ?? seasons.error ?? memberships.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    counts: {
      players: players.count ?? 0,
      teams: teams.count ?? 0,
      seasons: seasons.count ?? 0,
      memberships: memberships.count ?? 0,
    },
  });
}
