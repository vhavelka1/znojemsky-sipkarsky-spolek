import { NextResponse } from "next/server";
import { authorizeMatchAccess } from "@/lib/matchAccess";
import { matchVenue, teamVenues, type TeamVenueFields } from "@/lib/teamVenues";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeMatchAccess(request, id, { side: "home" });
  if (access.response) return access.response;
  const { supabase } = access;
  const body = await request.json().catch(() => null) as { venue?: unknown } | null;
  if (!body || !(body.venue === null || typeof body.venue === "string")) {
    return NextResponse.json({ error: "Vyberte hrací místo nebo výchozí místo týmu." }, { status: 400 });
  }
  const { data: match, error: matchError } = await supabase.from("matches")
    .select("home_team_id, status").eq("id", id).is("deleted_at", null).single();
  if (matchError || !match) {
    return NextResponse.json({ error: "Zápas nebyl nalezen." }, { status: 404 });
  }
  if (access.match && access.match.home_team_id !== match.home_team_id) {
    return NextResponse.json({ error: "Domácí tým se změnil. Načtěte zápas znovu." }, { status: 409 });
  }
  if (match.status !== "scheduled") {
    return NextResponse.json({ error: "Hrací místo lze měnit pouze u naplánovaného zápasu." }, { status: 409 });
  }
  const { data: season, error: seasonError } = await supabase.from("team_seasons")
    .select("team_id, home_venue").eq("id", match.home_team_id).is("deleted_at", null).single();
  if (seasonError || !season) {
    return NextResponse.json({ error: "Domácí tým se nepodařilo načíst." }, { status: 500 });
  }
  const { data: team, error: teamError } = await supabase.from("teams")
    .select("*").eq("id", season.team_id).is("deleted_at", null).single<TeamVenueFields>();
  if (teamError || !team) {
    return NextResponse.json({ error: "Hrací místa se nepodařilo načíst." }, { status: 500 });
  }
  const venues = teamVenues(team, season.home_venue);
  const override = typeof body.venue === "string" ? body.venue.trim() : null;
  if (override !== null && !venues.includes(override)) {
    return NextResponse.json({ error: "Vyberte některé z uložených hracích míst domácího týmu." }, { status: 400 });
  }
  const { data: saved, error } = await supabase.from("matches")
    .update({ venue_override: override }).eq("id", id).eq("home_team_id", match.home_team_id)
    .eq("status", "scheduled").is("deleted_at", null).select("id").maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Hrací místo se nepodařilo uložit." }, { status: 500 });
  }
  if (!saved) {
    return NextResponse.json({ error: "Zápas se mezitím změnil. Načtěte jej znovu." }, { status: 409 });
  }
  return NextResponse.json({ venue: matchVenue(override, venues[0]), venueOverride: override });
}
