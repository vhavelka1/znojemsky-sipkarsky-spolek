import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { createFacebookUpcomingRoundImageResponse } from "@/lib/facebookUpcomingRoundImage";
import { type FacebookImageKind } from "@/lib/facebookUpcomingRound";
import { loadFacebookUpcomingRound } from "@/lib/facebookUpcomingRound";

export const runtime = "nodejs";

function imageKind(value: string | null): FacebookImageKind | null {
  if (value === "results" || value === "standings" || value === "upcoming_schedule") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  try {
    const payload = await loadFacebookUpcomingRound({
      seasonId: request.nextUrl.searchParams.get("season_id"),
      leagueId: request.nextUrl.searchParams.get("league_id"),
      roundNumber: request.nextUrl.searchParams.get("round_number"),
      postType: request.nextUrl.searchParams.get("post_type"),
      origin: request.nextUrl.origin,
    });

    return createFacebookUpcomingRoundImageResponse(payload, request.nextUrl.origin, {
      groupId: request.nextUrl.searchParams.get("group_id"),
      kind: imageKind(request.nextUrl.searchParams.get("image_kind")),
    });
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
