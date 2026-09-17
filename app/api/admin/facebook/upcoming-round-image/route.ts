import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { createFacebookUpcomingRoundImageResponse } from "@/lib/facebookUpcomingRoundImage";
import { loadFacebookUpcomingRound } from "@/lib/facebookUpcomingRound";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  try {
    const payload = await loadFacebookUpcomingRound({
      seasonId: request.nextUrl.searchParams.get("season_id"),
      leagueId: request.nextUrl.searchParams.get("league_id"),
      groupId: request.nextUrl.searchParams.get("group_id"),
      roundNumber: request.nextUrl.searchParams.get("round_number"),
    });

    return createFacebookUpcomingRoundImageResponse(payload, request.nextUrl.origin);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Facebook grafiku se nepodařilo vytvořit.",
      },
      { status: 500 },
    );
  }
}
