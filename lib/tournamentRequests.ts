import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export type TournamentRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TournamentRequestType = "major" | "mini";

export type TournamentRequest = {
  id: string;
  tournament_type: TournamentRequestType;
  organizer_team_season_id: string;
  organizer_team_id: string;
  organizer_name: string;
  tournament_name: string;
  date: string;
  place: string;
  capacity: string;
  free_slots: string;
  poster_data_url: string;
  parts: TournamentRequestPart[];
  setup: TournamentSetup | null;
  note: string;
  status: TournamentRequestStatus;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
};

export type TournamentSetup = {
  board_count: number;
  category_settings: TournamentCategorySetup[];
};

export type TournamentCategorySetup = {
  part_id: string;
  category: string;
  is_doubles: boolean;
  player_count: number;
  board_numbers: number[];
  players: TournamentSetupPlayer[];
};

export type TournamentSetupPlayer = {
  id: string;
  player_id: string | null;
  name: string;
  is_registered: boolean;
  partner_player_id: string | null;
  partner_name: string;
  partner_is_registered: boolean;
  team_name: string;
};

export type TournamentRequestPart = {
  id: string;
  category: string;
  is_doubles: boolean;
  presentation: string;
  start_time: string;
  format: string;
  entry_fee: string;
  comment: string;
};

export type TournamentRequestInput = {
  tournament_type?: unknown;
  organizer_team_season_id?: unknown;
  organizer_team_id?: unknown;
  organizer_name?: unknown;
  tournament_name?: unknown;
  date?: unknown;
  place?: unknown;
  capacity?: unknown;
  free_slots?: unknown;
  poster_data_url?: unknown;
  parts?: unknown;
  note?: unknown;
};

const tournamentRequestsSettingKey = "tournament_requests";

function text(value: unknown, maxLength = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function requestType(value: unknown): TournamentRequestType {
  return value === "major" ? "major" : "mini";
}

function normalizePart(value: unknown): TournamentRequestPart {
  const part = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    id: typeof part.id === "string" && part.id ? part.id : crypto.randomUUID(),
    category: text(part.category, 120),
    is_doubles: Boolean(part.is_doubles),
    presentation: text(part.presentation, 80),
    start_time: text(part.start_time, 40),
    format: text(part.format, 80),
    entry_fee: text(part.entry_fee, 120),
    comment: text(part.comment, 1000),
  };
}

export function normalizeTournamentRequestInput(input: TournamentRequestInput) {
  const parts = Array.isArray(input.parts) ? input.parts.map(normalizePart) : [];

  return {
    tournament_type: requestType(input.tournament_type),
    organizer_team_season_id: text(input.organizer_team_season_id, 80),
    organizer_team_id: text(input.organizer_team_id, 80),
    organizer_name: text(input.organizer_name),
    tournament_name: text(input.tournament_name),
    date: text(input.date, 20),
    place: text(input.place),
    capacity: text(input.capacity, 20),
    free_slots: text(input.free_slots, 20),
    poster_data_url: text(input.poster_data_url, 1_500_000),
    parts,
    note: text(input.note, 1000),
  };
}

export function validateTournamentRequestInput(input: ReturnType<typeof normalizeTournamentRequestInput>) {
  if (!input.organizer_team_season_id || !input.organizer_team_id || !input.organizer_name || !input.tournament_name || !input.date || !input.place) {
    return "Vyplňte pořadatele, název turnaje, datum a místo.";
  }

  if (input.parts.length === 0) {
    return "Přidejte alespoň jednu kategorii turnaje.";
  }

  if (input.parts.some((part) => !part.category || !part.presentation || !part.start_time || !part.format || !part.entry_fee)) {
    return "U každé kategorie vyplňte kategorii, prezenci, začátek, formát a startovné.";
  }

  return null;
}

function isTournamentRequest(value: unknown): value is TournamentRequest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TournamentRequest>;
  return Boolean(item.id && item.tournament_name && item.created_at);
}

function normalizeStoredSetup(value: TournamentSetup | null): TournamentSetup | null {
  if (!value || typeof value !== "object") return null;
  const boardCount = Number(value.board_count);
  const categories = Array.isArray(value.category_settings) ? value.category_settings : [];

  return {
    board_count: Number.isFinite(boardCount) && boardCount > 0 ? Math.floor(boardCount) : 1,
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

              const storedPlayer = player && typeof player === "object" ? player as Partial<TournamentSetupPlayer> : {};

              return {
                id: typeof storedPlayer.id === "string" && storedPlayer.id ? storedPlayer.id : crypto.randomUUID(),
                player_id: typeof storedPlayer.player_id === "string" && storedPlayer.player_id ? storedPlayer.player_id : null,
                name: String(storedPlayer.name ?? "").trim(),
                is_registered: Boolean(storedPlayer.is_registered),
                partner_player_id: typeof storedPlayer.partner_player_id === "string" && storedPlayer.partner_player_id ? storedPlayer.partner_player_id : null,
                partner_name: String(storedPlayer.partner_name ?? "").trim(),
                partner_is_registered: Boolean(storedPlayer.partner_is_registered),
                team_name: String(storedPlayer.team_name ?? "").trim(),
              };
            })
            .filter((player) => player.name || player.partner_name || player.team_name)
        : [],
    })),
  };
}

function normalizeStoredTournamentRequest(value: TournamentRequest): TournamentRequest {
  const legacy = value as TournamentRequest & {
    presentation?: string;
    start_time?: string;
    format?: string;
    entry_fee?: string;
  };

  return {
    ...value,
    organizer_team_season_id: value.organizer_team_season_id ?? "",
    organizer_team_id: value.organizer_team_id ?? "",
    poster_data_url: value.poster_data_url ?? "",
    setup: normalizeStoredSetup(value.setup ?? null),
    parts: Array.isArray(value.parts) && value.parts.length > 0
      ? value.parts
      : [
          {
            id: "legacy",
            category: value.tournament_type === "major" ? "Major" : "Mini",
            is_doubles: false,
            presentation: legacy.presentation ?? "",
            start_time: legacy.start_time ?? "",
            format: legacy.format ?? "",
            entry_fee: legacy.entry_fee ?? "",
            comment: "",
          },
        ],
  };
}

export async function loadTournamentRequests() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", tournamentRequestsSettingKey)
    .is("deleted_at", null)
    .maybeSingle<{ value: string }>();

  if (error) throw new Error(error.message);

  if (!data?.value) return [];

  try {
    const parsed = JSON.parse(data.value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter(isTournamentRequest)
          .map(normalizeStoredTournamentRequest)
          .sort((first, second) => second.created_at.localeCompare(first.created_at))
      : [];
  } catch {
    return [];
  }
}

export async function saveTournamentRequests(requests: TournamentRequest[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: tournamentRequestsSettingKey,
      value: JSON.stringify(requests),
      deleted_at: null,
    },
    { onConflict: "key" },
  );

  if (error) throw new Error(error.message);
}

export async function createTournamentRequest(input: ReturnType<typeof normalizeTournamentRequestInput>) {
  const requests = await loadTournamentRequests();
  const request: TournamentRequest = {
    id: crypto.randomUUID(),
    ...input,
    status: "pending",
    admin_note: null,
    created_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by_user_id: null,
    setup: null,
  };

  await saveTournamentRequests([request, ...requests]);
  return request;
}
