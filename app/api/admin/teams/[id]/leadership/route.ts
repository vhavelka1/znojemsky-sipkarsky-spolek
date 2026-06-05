import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";

type LeadershipBody = {
  season_id?: unknown;
  captain_player_id?: unknown;
  assistant_player_ids?: unknown;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function guardRequest() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.ENABLE_DEV_ADMIN !== "true"
  ) {
    return NextResponse.json(
      { error: "Administrace týmů není povolena." },
      { status: 403 },
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

function optionalUuid(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function uuidList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nepodařilo se načíst serverové nastavení.",
        },
        { status: 500 },
      ),
    };
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const body = (await request.json().catch(() => null)) as LeadershipBody | null;
  const seasonId = optionalUuid(body?.season_id);
  const captainPlayerId = optionalUuid(body?.captain_player_id);
  const assistantPlayerIds = uuidList(body?.assistant_player_ids);

  if (!seasonId) {
    return NextResponse.json(
      { error: "Sezóna je povinná." },
      { status: 400 },
    );
  }

  if (captainPlayerId && assistantPlayerIds.includes(captainPlayerId)) {
    return NextResponse.json(
      { error: "Kapitán nemůže být zároveň zástupcem kapitána." },
      { status: 400 },
    );
  }

  const { id: teamId } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data: teamSeason, error: teamSeasonError } = await supabase
    .from("team_seasons")
    .select("id")
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .is("deleted_at", null)
    .maybeSingle();

  if (teamSeasonError) {
    return NextResponse.json({ error: teamSeasonError.message }, { status: 500 });
  }

  if (!teamSeason) {
    return NextResponse.json(
      { error: "Tým v této sezóně nemá soupisku." },
      { status: 400 },
    );
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("team_memberships")
    .select("id, player_id")
    .eq("team_season_id", teamSeason.id)
    .is("left_on", null)
    .is("deleted_at", null);

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const activePlayerIds = new Set((memberships ?? []).map((membership) => membership.player_id));
  const selectedPlayerIds = [
    ...(captainPlayerId ? [captainPlayerId] : []),
    ...assistantPlayerIds,
  ];

  if (selectedPlayerIds.some((playerId) => !activePlayerIds.has(playerId))) {
    return NextResponse.json(
      { error: "Kapitána nebo zástupce lze vybrat jen z aktivních hráčů týmu." },
      { status: 400 },
    );
  }

  if (selectedPlayerIds.length > 0) {
    const { data: selectedPlayers, error: selectedPlayersError } = await supabase
      .from("players")
      .select("id, display_name, email")
      .in("id", selectedPlayerIds)
      .is("deleted_at", null);

    if (selectedPlayersError) {
      return NextResponse.json(
        { error: selectedPlayersError.message },
        { status: 500 },
      );
    }

    const playersById = new Map(
      (selectedPlayers ?? []).map((player) => [player.id, player]),
    );
    const playersWithoutEmail = selectedPlayerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is { id: string; display_name: string; email: string | null } => {
        if (!player) {
          return false;
        }

        return !player.email?.trim();
      });

    if (playersWithoutEmail.length > 0) {
      return NextResponse.json(
        {
          error: `Kapitán nebo zástupce musí mít vyplněný email. Doplňte email hráči: ${playersWithoutEmail
            .map((player) => player.display_name)
            .join(", ")}.`,
        },
        { status: 400 },
      );
    }
  }

  const { error: resetError } = await supabase
    .from("team_memberships")
    .update({ member_role: "player" })
    .eq("team_season_id", teamSeason.id)
    .is("left_on", null)
    .is("deleted_at", null)
    .in("member_role", ["captain", "assistant_captain"]);

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  if (captainPlayerId) {
    const { error: captainError } = await supabase
      .from("team_memberships")
      .update({ member_role: "captain" })
      .eq("team_season_id", teamSeason.id)
      .eq("player_id", captainPlayerId)
      .is("left_on", null)
      .is("deleted_at", null);

    if (captainError) {
      return NextResponse.json({ error: captainError.message }, { status: 500 });
    }
  }

  if (assistantPlayerIds.length > 0) {
    const { error: assistantError } = await supabase
      .from("team_memberships")
      .update({ member_role: "assistant_captain" })
      .eq("team_season_id", teamSeason.id)
      .in("player_id", assistantPlayerIds)
      .is("left_on", null)
      .is("deleted_at", null);

    if (assistantError) {
      return NextResponse.json({ error: assistantError.message }, { status: 500 });
    }
  }

  const { data: updatedMemberships, error: updatedMembershipsError } = await supabase
    .from("team_memberships")
    .select("id, team_season_id, player_id, member_role, left_on")
    .eq("team_season_id", teamSeason.id)
    .is("left_on", null)
    .is("deleted_at", null);

  if (updatedMembershipsError) {
    return NextResponse.json(
      { error: updatedMembershipsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ memberships: updatedMemberships ?? [] });
}
