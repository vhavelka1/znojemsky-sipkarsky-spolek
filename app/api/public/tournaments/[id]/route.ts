import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { loadTournamentRequests, saveTournamentRequests, type TournamentSetup } from "@/lib/tournamentRequests";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type SetupBody = {
  setup?: TournamentSetup;
};

type PlayerOption = {
  id: string;
  name: string;
  isRegistered: boolean;
};

function rawRequestId(id: string) {
  return id.startsWith("request-") ? id.slice("request-".length) : id;
}

function toPublicTournament(request: Awaited<ReturnType<typeof loadTournamentRequests>>[number]) {
  return {
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
    organizerName: request.organizer_name,
    organizerTeamSeasonId: request.organizer_team_season_id,
    setup: request.setup,
  };
}

async function loadTournamentPlayerOptions(organizerTeamSeasonId: string): Promise<PlayerOption[]> {
  const supabase = createSupabaseAdminClient();
  const { data: teamSeason, error: teamSeasonError } = await supabase
    .from("team_seasons")
    .select("season_id")
    .eq("id", organizerTeamSeasonId)
    .is("deleted_at", null)
    .maybeSingle<{ season_id: string }>();

  if (teamSeasonError) throw new Error(teamSeasonError.message);

  const [playersResult, membershipsResult] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name")
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .returns<Array<{ id: string; display_name: string }>>(),
    teamSeason?.season_id
      ? supabase
          .from("team_memberships")
          .select("player_id")
          .eq("season_id", teamSeason.season_id)
          .is("left_on", null)
          .is("deleted_at", null)
          .returns<Array<{ player_id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = playersResult.error ?? membershipsResult.error;
  if (error) throw new Error(error.message);

  const registeredPlayerIds = new Set((membershipsResult.data ?? []).map((membership) => membership.player_id));

  return (playersResult.data ?? []).map((player) => ({
    id: player.id,
    name: player.display_name,
    isRegistered: registeredPlayerIds.has(player.id),
  }));
}

async function canManageTournament(request: Request, organizerTeamSeasonId: string) {
  const profile = await getCurrentUserProfile(request).catch(() => null);
  if (!profile?.isActive) return false;
  if (hasAtLeastRole(profile.role, "admin")) return true;
  if (!profile.playerId) return false;

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("team_memberships")
    .select("id")
    .eq("player_id", profile.playerId)
    .eq("team_season_id", organizerTeamSeasonId)
    .in("member_role", ["captain", "assistant_captain"])
    .is("left_on", null)
    .is("deleted_at", null)
    .limit(1);

  return Boolean(data?.[0]);
}

function normalizeSetup(value: TournamentSetup | undefined, playerOptions: PlayerOption[] = []): TournamentSetup | null {
  if (!value || typeof value !== "object") return null;
  const boardCount = Number(value.board_count);
  const categories = Array.isArray(value.category_settings) ? value.category_settings : [];
  const playerOptionById = new Map(playerOptions.map((player) => [player.id, player]));

  return {
    board_count: Number.isFinite(boardCount) && boardCount > 0 ? Math.min(Math.floor(boardCount), 64) : 1,
    category_settings: categories.map((category) => ({
      part_id: String(category.part_id ?? ""),
      category: String(category.category ?? ""),
      is_doubles: Boolean(category.is_doubles),
      player_count: Math.max(0, Math.floor(Number(category.player_count) || 0)),
      board_numbers: Array.isArray(category.board_numbers)
        ? category.board_numbers.map((board) => Math.floor(Number(board))).filter((board) => board > 0)
        : [],
      players: Array.isArray(category.players)
        ? (category.players as unknown[])
            .map((player) => {
              if (typeof player === "string") {
                return {
                  id: crypto.randomUUID(),
                  player_id: null,
                  name: player.trim(),
                  is_registered: false,
                  partner_player_id: null,
                  partner_name: "",
                  partner_is_registered: false,
                  team_name: "",
                };
              }

              const storedPlayer = player && typeof player === "object" ? player as Partial<TournamentSetup["category_settings"][number]["players"][number]> : {};
              const playerOption = typeof storedPlayer.player_id === "string" ? playerOptionById.get(storedPlayer.player_id) : null;
              const partnerOption = typeof storedPlayer.partner_player_id === "string" ? playerOptionById.get(storedPlayer.partner_player_id) : null;

              return {
                id: typeof storedPlayer.id === "string" && storedPlayer.id ? storedPlayer.id : crypto.randomUUID(),
                player_id: playerOption?.id ?? null,
                name: playerOption?.name ?? String(storedPlayer.name ?? "").trim(),
                is_registered: Boolean(playerOption?.isRegistered),
                partner_player_id: partnerOption?.id ?? null,
                partner_name: partnerOption?.name ?? String(storedPlayer.partner_name ?? "").trim(),
                partner_is_registered: Boolean(partnerOption?.isRegistered),
                team_name: String(storedPlayer.team_name ?? "").trim(),
              };
            })
            .filter((player) => player.name || player.partner_name || player.team_name)
        : [],
    })),
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const requests = await loadTournamentRequests();
  const tournamentRequest = requests.find((item) => item.id === rawRequestId(id) && item.status === "approved");

  if (!tournamentRequest) {
    return NextResponse.json({ error: "Turnaj nebyl nalezen." }, { status: 404 });
  }

  return NextResponse.json({
    tournament: toPublicTournament(tournamentRequest),
    canManage: await canManageTournament(request, tournamentRequest.organizer_team_season_id),
    playerOptions: await loadTournamentPlayerOptions(tournamentRequest.organizer_team_season_id),
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const requests = await loadTournamentRequests();
  const tournamentRequest = requests.find((item) => item.id === rawRequestId(id) && item.status === "approved");

  if (!tournamentRequest) {
    return NextResponse.json({ error: "Turnaj nebyl nalezen." }, { status: 404 });
  }

  if (!(await canManageTournament(request, tournamentRequest.organizer_team_season_id))) {
    return NextResponse.json({ error: "Pro nastavení turnaje nemáte oprávnění." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as SetupBody;
  const playerOptions = await loadTournamentPlayerOptions(tournamentRequest.organizer_team_season_id);
  const setup = normalizeSetup(body.setup, playerOptions);
  if (!setup) {
    return NextResponse.json({ error: "Nastavení turnaje není platné." }, { status: 400 });
  }

  await saveTournamentRequests(requests.map((item) => (item.id === tournamentRequest.id ? { ...item, setup } : item)));

  return NextResponse.json({ setup });
}
