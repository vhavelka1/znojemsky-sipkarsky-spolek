import { requireAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  residence: string | null;
  is_active: boolean;
};

type SeasonRow = {
  id: string;
  is_active: boolean;
  starts_on: string;
};

type TeamRow = {
  id: string;
  name: string;
};

type TeamSeasonRow = {
  id: string;
  team_id: string;
  display_name: string | null;
};

type MembershipRow = {
  player_id: string;
  season_id: string;
  team_season_id: string;
};

function csvValue(value: string | null | undefined) {
  const text = value ?? "";
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | null | undefined>) {
  return values.map(csvValue).join(";");
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) {
    return guard.response;
  }

  const supabase = createSupabaseAdminClient();
  const [playersResult, seasonsResult, teamsResult, teamSeasonsResult, membershipsResult] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, residence, is_active")
      .is("deleted_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false })
      .returns<PlayerRow[]>(),
    supabase
      .from("seasons")
      .select("id, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .returns<SeasonRow[]>(),
    supabase
      .from("teams")
      .select("id, name")
      .is("deleted_at", null)
      .returns<TeamRow[]>(),
    supabase
      .from("team_seasons")
      .select("id, team_id, display_name")
      .is("deleted_at", null)
      .returns<TeamSeasonRow[]>(),
    supabase
      .from("team_memberships")
      .select("player_id, season_id, team_season_id")
      .is("deleted_at", null)
      .is("left_on", null)
      .returns<MembershipRow[]>(),
  ]);

  const error =
    playersResult.error ??
    seasonsResult.error ??
    teamsResult.error ??
    teamSeasonsResult.error ??
    membershipsResult.error;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const activeSeasonId =
    (seasonsResult.data ?? []).find((season) => season.is_active)?.id ??
    seasonsResult.data?.[0]?.id ??
    "";
  const teamById = new Map((teamsResult.data ?? []).map((team) => [team.id, team]));
  const teamSeasonById = new Map((teamSeasonsResult.data ?? []).map((teamSeason) => [teamSeason.id, teamSeason]));
  const teamNamesByPlayerId = new Map<string, Set<string>>();

  for (const membership of membershipsResult.data ?? []) {
    if (activeSeasonId && membership.season_id !== activeSeasonId) {
      continue;
    }

    const teamSeason = teamSeasonById.get(membership.team_season_id);
    const team = teamSeason ? teamById.get(teamSeason.team_id) : null;
    const teamName = teamSeason?.display_name || team?.name;

    if (!teamName) {
      continue;
    }

    const playerTeamNames = teamNamesByPlayerId.get(membership.player_id) ?? new Set<string>();
    playerTeamNames.add(teamName);
    teamNamesByPlayerId.set(membership.player_id, playerTeamNames);
  }

  const rows = [
    csvRow(["jméno", "příjmení", "tým", "datum narození", "bydliště", "aktivní"]),
    ...(playersResult.data ?? []).map((player) =>
      csvRow([
        player.first_name,
        player.last_name,
        [...(teamNamesByPlayerId.get(player.id) ?? [])].sort((a, b) => a.localeCompare(b, "cs")).join(", "),
        player.date_of_birth,
        player.residence,
        player.is_active ? "ano" : "ne",
      ]),
    ),
  ];
  const csv = `\uFEFF${rows.join("\r\n")}\r\n`;

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="hraci-vsichni-${fileDate()}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
