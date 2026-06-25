import { NextResponse } from "next/server";
import { getCurrentUserProfile, hasAtLeastRole, requireAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type PlayerStatus = "active" | "needs_registration" | "new" | "duplicate" | "pending";

type TeamRegistrationRequest = {
  id: string;
  season_id: string | null;
  team_name: string;
  captain_name: string;
  captain_email: string;
  captain_phone: string | null;
  preferred_league_id: string | null;
  preferred_group_id: string | null;
  note: string | null;
  status: RequestStatus;
  admin_note: string | null;
  created_at: string;
};

type TeamRegistrationPlayer = {
  id: string;
  request_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  matched_player_id: string | null;
  player_status: PlayerStatus;
};

type PlayerRegistrationRequest = {
  id: string;
  season_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_team_name: string | null;
  preferred_team_id: string | null;
  looking_for_team: boolean;
  note: string | null;
  status: RequestStatus;
  admin_note: string | null;
  matched_player_id: string | null;
  created_at: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  slug: string;
};

type SeasonRow = { id: string; name: string; is_active: boolean };
type LeagueRow = { id: string; name: string };
type GroupRow = { id: string; name: string };

type ReviewBody = {
  kind?: unknown;
  id?: unknown;
  action?: unknown;
  admin_note?: unknown;
  matched_player_id?: unknown;
  preferred_team_id?: unknown;
  roster_matches?: unknown;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(value: unknown) {
  return optionalString(value);
}

function isUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function optionalUuid(value: unknown) {
  const text = optionalString(value);
  return isUuid(text) ? text : null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fullName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? name,
    lastName: parts.slice(1).join(" "),
  };
}

function createSlug(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || crypto.randomUUID()
  );
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function guardModerator(request: Request) {
  const profile = await getCurrentUserProfile(request);
  if (!profile?.isActive) {
    return {
      profile,
      response: NextResponse.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 }),
    };
  }

  if (!hasAtLeastRole(profile.role, "moderator")) {
    return {
      profile,
      response: NextResponse.json({ error: "Pro tuto akci nemáte oprávnění." }, { status: 403 }),
    };
  }

  return { profile, response: null };
}

function detectPlayerStatus(
  submitted: { first_name: string; last_name: string; email: string | null; matched_player_id?: string | null },
  players: PlayerRow[],
) {
  if (submitted.matched_player_id && players.some((player) => player.id === submitted.matched_player_id)) {
    return { status: "active" as PlayerStatus, matchedPlayerId: submitted.matched_player_id };
  }

  if (submitted.email) {
    const byEmail = players.find((player) => normalize(player.email) === normalize(submitted.email));
    if (byEmail) return { status: "active" as PlayerStatus, matchedPlayerId: byEmail.id };
  }

  const submittedName = normalize(fullName(submitted.first_name, submitted.last_name));
  const byName = players.find((player) => normalize(player.display_name) === submittedName || normalize(fullName(player.first_name, player.last_name)) === submittedName);
  if (byName) return { status: "duplicate" as PlayerStatus, matchedPlayerId: byName.id };

  return { status: "new" as PlayerStatus, matchedPlayerId: null };
}

async function createOrFindTeam(supabase: ReturnType<typeof createSupabaseAdminClient>, teamName: string) {
  const { data: existing, error: lookupError } = await supabase
    .from("teams")
    .select("id, name, slug")
    .ilike("name", teamName)
    .is("deleted_at", null)
    .maybeSingle<TeamRow>();

  if (lookupError) throw new Error(lookupError.message);
  if (existing) return existing;

  const slugBase = createSlug(teamName);
  const { data, error } = await supabase
    .from("teams")
    .insert({ name: teamName, slug: slugBase })
    .select("id, name, slug")
    .single<TeamRow>();

  if (error) throw new Error(error.message);
  return data;
}

async function createOrFindTeamSeason(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  teamId: string,
  seasonId: string | null,
  displayName: string,
) {
  if (!seasonId) return null;

  const { data: existing, error: lookupError } = await supabase
    .from("team_seasons")
    .select("id")
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (lookupError) throw new Error(lookupError.message);
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("team_seasons")
    .insert({ team_id: teamId, season_id: seasonId, display_name: displayName })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(error.message);
  return data.id;
}

async function createOrFindPlayer(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  data: { firstName: string; lastName: string; email: string | null; phone?: string | null; matchedPlayerId?: string | null },
) {
  if (data.matchedPlayerId) return data.matchedPlayerId;

  if (data.email) {
    const { data: existing, error } = await supabase
      .from("players")
      .select("id")
      .ilike("email", data.email)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(error.message);
    if (existing) return existing.id;
  }

  const name = fullName(data.firstName, data.lastName);
  const { data: byName, error: byNameError } = await supabase
    .from("players")
    .select("id")
    .ilike("display_name", name)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (byNameError) throw new Error(byNameError.message);
  if (byName) return byName.id;

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      display_name: name,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(`Hráče ${name} se nepodařilo vytvořit: ${error.message}`);
  return created.id;
}

async function ensureMembership(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  seasonId: string | null,
  teamSeasonId: string | null,
  playerId: string,
  memberRole: "player" | "captain",
) {
  if (!seasonId || !teamSeasonId) return;

  const { data: existing, error: lookupError } = await supabase
    .from("team_memberships")
    .select("id, team_season_id, member_role")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .is("left_on", null)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; team_season_id: string; member_role: string }>();

  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    if (existing.team_season_id === teamSeasonId && existing.member_role !== memberRole) {
      const { error } = await supabase.from("team_memberships").update({ member_role: memberRole }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("team_memberships").insert({
    season_id: seasonId,
    team_season_id: teamSeasonId,
    player_id: playerId,
    member_role: memberRole,
    joined_on: todayIsoDate(),
  });

  if (error) throw new Error(error.message);
}

async function loadPayload(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const [
    teamRequests,
    teamPlayers,
    playerRequests,
    players,
    teams,
    seasons,
    leagues,
    groups,
  ] = await Promise.all([
    supabase
      .from("team_registration_requests")
      .select("id, season_id, team_name, captain_name, captain_email, captain_phone, preferred_league_id, preferred_group_id, note, status, admin_note, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<TeamRegistrationRequest[]>(),
    supabase
      .from("team_registration_players")
      .select("id, request_id, first_name, last_name, email, phone, note, matched_player_id, player_status")
      .returns<TeamRegistrationPlayer[]>(),
    supabase
      .from("player_registration_requests")
      .select("id, season_id, first_name, last_name, email, phone, preferred_team_name, preferred_team_id, looking_for_team, note, status, admin_note, matched_player_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<PlayerRegistrationRequest[]>(),
    supabase
      .from("players")
      .select("id, display_name, first_name, last_name, email")
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .returns<PlayerRow[]>(),
    supabase
      .from("teams")
      .select("id, name, slug")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<TeamRow[]>(),
    supabase
      .from("seasons")
      .select("id, name, is_active")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .returns<SeasonRow[]>(),
    supabase
      .from("leagues")
      .select("id, name")
      .is("deleted_at", null)
      .returns<LeagueRow[]>(),
    supabase
      .from("league_groups")
      .select("id, name")
      .is("deleted_at", null)
      .returns<GroupRow[]>(),
  ]);

  const error = teamRequests.error ?? teamPlayers.error ?? playerRequests.error ?? players.error ?? teams.error ?? seasons.error ?? leagues.error ?? groups.error;
  if (error) throw new Error(error.message);

  const playerRows = players.data ?? [];
  const playersByRequest = new Map<string, TeamRegistrationPlayer[]>();
  (teamPlayers.data ?? []).forEach((player) => {
    const detection = detectPlayerStatus(player, playerRows);
    playersByRequest.set(player.request_id, [
      ...(playersByRequest.get(player.request_id) ?? []),
      {
        ...player,
        player_status: detection.status,
        matched_player_id: player.matched_player_id ?? detection.matchedPlayerId,
      },
    ]);
  });

  return {
    teamRequests: (teamRequests.data ?? []).map((request) => ({
      ...request,
      roster: playersByRequest.get(request.id) ?? [],
      rosterCount: playersByRequest.get(request.id)?.length ?? 0,
    })),
    playerRequests: (playerRequests.data ?? []).map((request) => {
      const detection = detectPlayerStatus(
        {
          first_name: request.first_name,
          last_name: request.last_name,
          email: request.email,
          matched_player_id: request.matched_player_id,
        },
        playerRows,
      );
      return {
        ...request,
        player_status: detection.status,
        matched_player_id: request.matched_player_id ?? detection.matchedPlayerId,
      };
    }),
    players: playerRows,
    teams: teams.data ?? [],
    seasons: seasons.data ?? [],
    leagues: leagues.data ?? [],
    groups: groups.data ?? [],
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(payload: Awaited<ReturnType<typeof loadPayload>>) {
  const rows = [
    ["typ žádosti", "tým", "kapitán", "hráč", "email", "telefon", "stav hráče", "stav žádosti", "poznámka"],
  ];

  payload.teamRequests.forEach((request) => {
    request.roster.forEach((player) => {
      rows.push([
        "tým",
        request.team_name,
        request.captain_name,
        fullName(player.first_name, player.last_name),
        player.email ?? "",
        player.phone ?? "",
        player.player_status,
        request.status,
        player.note ?? request.note ?? "",
      ]);
    });
  });

  payload.playerRequests.forEach((request) => {
    rows.push([
      "jednotlivec",
      request.preferred_team_name ?? "",
      "",
      fullName(request.first_name, request.last_name),
      request.email,
      request.phone ?? "",
      request.player_status,
      request.status,
      request.note ?? "",
    ]);
  });

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function GET(request: Request) {
  const guard = await guardModerator(request);
  if (guard.response) return guard.response;

  try {
    const supabase = createSupabaseAdminClient();
    const payload = await loadPayload(supabase);
    const url = new URL(request.url);

    if (url.searchParams.get("export") === "csv") {
      return new Response(`\uFEFF${toCsv(payload)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="registrace.csv"',
        },
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádosti se nepodařilo načíst." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const guard = await guardModerator(request);
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  const kind = requiredString(body?.kind);
  const id = requiredString(body?.id);
  const action = requiredString(body?.action);
  const adminNote = optionalString(body?.admin_note);

  if (!id || (kind !== "team" && kind !== "player") || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Vyberte platnou žádost a akci." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const reviewed = {
      reviewed_by_user_id: guard.profile!.userId,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote,
    };

    if (kind === "team") {
      const { data: requestRow, error: requestError } = await supabase
        .from("team_registration_requests")
        .select("id, season_id, team_name, captain_name, captain_email, captain_phone, status")
        .eq("id", id)
        .is("deleted_at", null)
        .single<Pick<TeamRegistrationRequest, "id" | "season_id" | "team_name" | "captain_name" | "captain_email" | "captain_phone" | "status">>();

      if (requestError || !requestRow) {
        return NextResponse.json({ error: "Žádost nebyla nalezena." }, { status: 404 });
      }

      if (requestRow.status !== "pending" && !(requestRow.status === "approved" && action === "approve")) {
        return NextResponse.json({ error: "Tato žádost už byla zpracována." }, { status: 400 });
      }

      if (action === "reject") {
        if (requestRow.status !== "pending") {
          return NextResponse.json({ error: "Zamítnout lze jen žádost čekající na schválení." }, { status: 400 });
        }
        const { error } = await supabase.from("team_registration_requests").update({ status: "rejected", ...reviewed }).eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ message: "Žádost byla zamítnuta." });
      }

      const rosterMatches = typeof body?.roster_matches === "object" && body.roster_matches !== null
        ? body.roster_matches as Record<string, unknown>
        : {};
      const { data: roster, error: rosterError } = await supabase
        .from("team_registration_players")
        .select("id, first_name, last_name, email, phone, matched_player_id")
        .eq("request_id", id)
        .returns<Array<Pick<TeamRegistrationPlayer, "id" | "first_name" | "last_name" | "email" | "phone" | "matched_player_id">>>();

      if (rosterError) throw new Error(rosterError.message);

      const team = await createOrFindTeam(supabase, requestRow.team_name);
      const teamSeasonId = await createOrFindTeamSeason(supabase, team.id, requestRow.season_id, requestRow.team_name);
      const captainParts = splitName(requestRow.captain_name);
      const captainId = await createOrFindPlayer(supabase, {
        firstName: captainParts.firstName,
        lastName: captainParts.lastName,
        email: requestRow.captain_email,
        phone: requestRow.captain_phone,
      });
      await ensureMembership(supabase, requestRow.season_id, teamSeasonId, captainId, "captain");

      for (const row of roster ?? []) {
        const matchedPlayerId = optionalUuid(rosterMatches[row.id]) ?? row.matched_player_id;
        const playerId = await createOrFindPlayer(supabase, {
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phone: row.phone,
          matchedPlayerId,
        });
        const { error } = await supabase.from("team_registration_players").update({ matched_player_id: playerId, player_status: "active" }).eq("id", row.id);
        if (error) throw new Error(error.message);
      }

      const { error } = await supabase.from("team_registration_requests").update({ status: "approved", ...reviewed }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ message: "Žádost byla schválena." });
    }

    const { data: requestRow, error: requestError } = await supabase
      .from("player_registration_requests")
      .select("id, season_id, first_name, last_name, email, phone, preferred_team_id, matched_player_id, status")
      .eq("id", id)
      .is("deleted_at", null)
      .single<Pick<PlayerRegistrationRequest, "id" | "season_id" | "first_name" | "last_name" | "email" | "phone" | "preferred_team_id" | "matched_player_id" | "status">>();

    if (requestError || !requestRow) {
      return NextResponse.json({ error: "Žádost nebyla nalezena." }, { status: 404 });
    }

    if (requestRow.status !== "pending") {
      return NextResponse.json({ error: "Tato žádost už byla zpracována." }, { status: 400 });
    }

    if (action === "reject") {
      const { error } = await supabase.from("player_registration_requests").update({ status: "rejected", ...reviewed }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ message: "Žádost byla zamítnuta." });
    }

    const matchedPlayerId = optionalUuid(body?.matched_player_id) ?? requestRow.matched_player_id;
    const preferredTeamId = optionalUuid(body?.preferred_team_id) ?? requestRow.preferred_team_id;
    const playerId = await createOrFindPlayer(supabase, {
      firstName: requestRow.first_name,
      lastName: requestRow.last_name,
      email: requestRow.email,
      phone: requestRow.phone,
      matchedPlayerId,
    });

    const { error } = await supabase
      .from("player_registration_requests")
      .update({ status: "approved", matched_player_id: playerId, preferred_team_id: preferredTeamId, ...reviewed })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ message: "Žádost byla schválena." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádost se nepodařilo zpracovat." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const kind = requiredString(url.searchParams.get("kind"));
  const id = requiredString(url.searchParams.get("id"));

  if (!id || (kind !== "team" && kind !== "player")) {
    return NextResponse.json({ error: "Vyberte platnou žádost." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const reviewedAt = new Date().toISOString();
    const reviewedBy = guard.profile!.userId;

    const updatePayload = {
      deleted_at: reviewedAt,
      reviewed_by_user_id: reviewedBy,
      reviewed_at: reviewedAt,
    };

    const result = kind === "team"
      ? await supabase
          .from("team_registration_requests")
          .update(updatePayload)
          .eq("id", id)
          .is("deleted_at", null)
      : await supabase
          .from("player_registration_requests")
          .update(updatePayload)
          .eq("id", id)
          .is("deleted_at", null);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Žádost byla odstraněna." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Žádost se nepodařilo odstranit." },
      { status: 500 },
    );
  }
}
