import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createTournamentRequest,
  normalizeTournamentRequestInput,
  validateTournamentRequestInput,
  type TournamentRequestInput,
} from "@/lib/tournamentRequests";

type OrganizerOption = {
  teamSeasonId: string;
  teamId: string;
  name: string;
  seasonName: string;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  season_id: string;
  display_name: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type SeasonRow = {
  id: string;
  name: string;
};

async function loadOrganizerOptions(request: Request) {
  const profile = await getCurrentUserProfile(request);

  if (!profile?.isActive) {
    return { profile, response: NextResponse.json({ error: "Pro vytvoření žádosti se nejprve přihlaste." }, { status: 401 }), options: [] };
  }

  const supabase = createSupabaseAdminClient();
  const teamSeasonsResult = await supabase
    .from("team_seasons")
    .select("id, team_id, season_id, display_name")
    .is("deleted_at", null)
    .returns<TeamSeasonRow[]>();

  if (teamSeasonsResult.error) throw new Error(teamSeasonsResult.error.message);

  let teamSeasons = teamSeasonsResult.data ?? [];

  if (!hasAtLeastRole(profile.role, "admin")) {
    if (!profile.playerId) {
      return { profile, response: null, options: [] };
    }

    const membershipsResult = await supabase
      .from("team_memberships")
      .select("team_season_id")
      .eq("player_id", profile.playerId)
      .in("member_role", ["captain", "assistant_captain"])
      .is("left_on", null)
      .is("deleted_at", null)
      .returns<Array<{ team_season_id: string }>>();

    if (membershipsResult.error) throw new Error(membershipsResult.error.message);

    const allowedTeamSeasonIds = new Set((membershipsResult.data ?? []).map((membership) => membership.team_season_id));
    teamSeasons = teamSeasons.filter((teamSeason) => allowedTeamSeasonIds.has(teamSeason.id));
  }

  const teamIds = [...new Set(teamSeasons.map((teamSeason) => teamSeason.team_id))];
  const seasonIds = [...new Set(teamSeasons.map((teamSeason) => teamSeason.season_id))];

  const [teamsResult, seasonsResult] = await Promise.all([
    teamIds.length
      ? supabase.from("teams").select("id, name").in("id", teamIds).is("deleted_at", null).returns<TeamRow[]>()
      : Promise.resolve({ data: [], error: null }),
    seasonIds.length
      ? supabase.from("seasons").select("id, name").in("id", seasonIds).is("deleted_at", null).returns<SeasonRow[]>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = teamsResult.error ?? seasonsResult.error;
  if (error) throw new Error(error.message);

  const teamById = new Map((teamsResult.data ?? []).map((team) => [team.id, team]));
  const seasonById = new Map((seasonsResult.data ?? []).map((season) => [season.id, season]));
  const options = teamSeasons
    .map((teamSeason): OrganizerOption => {
      const teamName = teamById.get(teamSeason.team_id)?.name ?? teamSeason.display_name ?? "Neznámý tým";
      const seasonName = seasonById.get(teamSeason.season_id)?.name ?? "";

      return {
        teamSeasonId: teamSeason.id,
        teamId: teamSeason.team_id,
        name: teamSeason.display_name || teamName,
        seasonName,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name, "cs"));

  return { profile, response: null, options };
}

export async function GET(request: Request) {
  try {
    const { response, options } = await loadOrganizerOptions(request);
    if (response) return response;

    return NextResponse.json({ organizers: options });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pořadatele se nepodařilo načíst.", organizers: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { response, options } = await loadOrganizerOptions(request);
    if (response) return response;

    const body = (await request.json().catch(() => ({}))) as TournamentRequestInput;
    const requestedOrganizerId = typeof body.organizer_team_season_id === "string" ? body.organizer_team_season_id.trim() : "";
    const organizer = options.find((option) => option.teamSeasonId === requestedOrganizerId);

    if (!organizer) {
      return NextResponse.json({ error: "Pro zvolený tým nemáte oprávnění vytvořit žádost." }, { status: 403 });
    }

    const input = normalizeTournamentRequestInput({
      ...body,
      organizer_team_season_id: organizer.teamSeasonId,
      organizer_team_id: organizer.teamId,
      organizer_name: organizer.name,
    });
    const validationError = validateTournamentRequestInput(input);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const tournamentRequest = await createTournamentRequest(input);
    return NextResponse.json({ request: tournamentRequest }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádost o turnaj se nepodařilo uložit." },
      { status: 500 },
    );
  }
}
