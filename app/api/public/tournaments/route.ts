import { NextResponse } from "next/server";
import { loadTournamentRequests } from "@/lib/tournamentRequests";

export async function GET() {
  try {
    const requests = await loadTournamentRequests();
    const tournaments = requests
      .filter((request) => request.status === "approved")
      .map((request) => ({
        id: `request-${request.id}`,
        name: request.tournament_name,
        type: request.tournament_type,
        date: request.date,
        place: request.place,
        format: request.parts.map((part) => part.format).filter(Boolean).join(" / "),
        capacity: request.capacity,
        freeSlots: request.free_slots,
        posterDataUrl: request.poster_data_url,
        status: "registration_open",
        parts: request.parts,
        organizerTeamSeasonId: request.organizer_team_season_id,
        setup: request.setup,
      }));

    return NextResponse.json({ tournaments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Turnaje se nepodařilo načíst.", tournaments: [] },
      { status: 500 },
    );
  }
}
