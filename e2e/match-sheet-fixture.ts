import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TestInfo } from "@playwright/test";

export type ActorKey = "kohouti-1" | "kohouti-2" | "kobry";

type ActorCredentials = {
  email: string;
  password: string;
};

type FixtureActor = {
  key: ActorKey;
  credentials: ActorCredentials;
};

type PlayerRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  email?: string | null;
};

type MembershipRow = {
  id: string;
  season_id: string;
  team_season_id: string;
  player_id: string;
  member_role: "player" | "captain" | "assistant_captain";
};

type TeamSeasonRow = {
  id: string;
  season_id: string;
  display_name: string;
};

type LeagueGroupTeamRow = {
  league_group_id: string;
  team_season_id: string;
  league_groups: {
    id: string;
    league_id: string;
  } | null;
};

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
};

type MatchGameRow = {
  id: string;
  order_number: number;
};

export type IsolatedMatchFixture = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  cleanup: () => Promise<void>;
};

const forbiddenSupabaseHosts = new Set([
  "edcilogoqicbygtywbzq.supabase.co",
  ...(process.env.ZSS_E2E_FORBID_SUPABASE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
]);

export function shouldUseIsolatedMatch() {
  return process.env.ZSS_E2E_USE_ISOLATED_MATCH === "true";
}

export async function createIsolatedMatchFixture(
  actors: FixtureActor[],
  testInfo: TestInfo,
): Promise<IsolatedMatchFixture> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for isolated E2E fixture.");
  }

  const supabaseHost = new URL(supabaseUrl).hostname;
  if (process.env.ZSS_E2E_DATABASE_CONFIRMATION !== "staging") {
    throw new Error("Isolated match fixture requires ZSS_E2E_DATABASE_CONFIRMATION=staging.");
  }
  if (forbiddenSupabaseHosts.has(supabaseHost)) {
    throw new Error(`Refusing to create an isolated E2E match in forbidden Supabase host ${supabaseHost}.`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const created: {
    matchId?: string;
    gameIds: string[];
  } = { gameIds: [] };

  const cleanup = async () => {
    if (!created.matchId) return;
    await cleanupMatchFixture(supabase, created.matchId, testInfo);
  };

  try {
    const actorContext = await resolveActorContext(supabase, actors);
    const { match, games } = await insertMatchFixture(supabase, actorContext);
    created.matchId = match.id;
    created.gameIds = games.map((game) => game.id);

    await testInfo.attach("isolated-match-fixture.json", {
      body: JSON.stringify(
        {
          matchId: match.id,
          homeTeamName: actorContext.homeTeam.display_name,
          awayTeamName: actorContext.awayTeam.display_name,
          homeTeamSeasonId: match.home_team_id,
          awayTeamSeasonId: match.away_team_id,
          gameCount: games.length,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    return {
      matchId: match.id,
      homeTeamName: actorContext.homeTeam.display_name,
      awayTeamName: actorContext.awayTeam.display_name,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function resolveActorContext(supabase: SupabaseClient, actors: FixtureActor[]) {
  const emails = actors.map((actor) => actor.credentials.email.trim()).filter(Boolean);
  if (emails.length !== actors.length) {
    throw new Error("All actor emails must be configured before creating an isolated E2E match.");
  }

  const { data: playersByEmail, error: playersByEmailError } = await supabase
    .from("players")
    .select("id, user_id, display_name, email")
    .in("email", emails)
    .is("deleted_at", null)
    .returns<PlayerRow[]>();
  if (playersByEmailError) throw playersByEmailError;

  const playerByEmail = new Map((playersByEmail ?? []).map((player) => [player.email?.toLowerCase(), player]));
  const missingEmails = emails.filter((email) => !playerByEmail.has(email.toLowerCase()));
  if (missingEmails.length > 0) {
    throw new Error(`Could not resolve E2E actor players by email: ${missingEmails.join(", ")}`);
  }

  const playerByActor = new Map(
    actors.map((actor) => [actor.key, playerByEmail.get(actor.credentials.email.toLowerCase())!]),
  );
  const playerIds = [...playerByActor.values()].map((player) => player.id);

  const { data: memberships, error: membershipError } = await supabase
    .from("team_memberships")
    .select("id, season_id, team_season_id, player_id, member_role")
    .in("player_id", playerIds)
    .in("member_role", ["captain", "assistant_captain"])
    .is("deleted_at", null)
    .is("left_on", null)
    .returns<MembershipRow[]>();
  if (membershipError) throw membershipError;

  const membershipsFor = (key: ActorKey) =>
    (memberships ?? []).filter((membership) => membership.player_id === playerByActor.get(key)?.id);
  const homeOneMemberships = membershipsFor("kohouti-1");
  const homeTwoMemberships = membershipsFor("kohouti-2");
  const awayMemberships = membershipsFor("kobry");

  const homeMembership = homeOneMemberships.find((first) =>
    homeTwoMemberships.some(
      (second) =>
        second.season_id === first.season_id &&
        second.team_season_id === first.team_season_id,
    ) &&
    awayMemberships.some(
      (away) =>
        away.season_id === first.season_id &&
        away.team_season_id !== first.team_season_id,
    ),
  );
  if (!homeMembership) {
    throw new Error("Could not find a shared home captain team for kohouti-1/kohouti-2 and an opponent team for kobry.");
  }

  const awayMembership = awayMemberships.find(
    (membership) =>
      membership.season_id === homeMembership.season_id &&
      membership.team_season_id !== homeMembership.team_season_id,
  );
  if (!awayMembership) {
    throw new Error("Could not find an away captain membership in the same season.");
  }

  const { data: teams, error: teamsError } = await supabase
    .from("team_seasons")
    .select("id, season_id, display_name")
    .in("id", [homeMembership.team_season_id, awayMembership.team_season_id])
    .is("deleted_at", null)
    .returns<TeamSeasonRow[]>();
  if (teamsError) throw teamsError;

  const homeTeam = teams?.find((team) => team.id === homeMembership.team_season_id);
  const awayTeam = teams?.find((team) => team.id === awayMembership.team_season_id);
  if (!homeTeam || !awayTeam) {
    throw new Error("Could not load team season rows for isolated match fixture.");
  }

  const { data: groupTeams, error: groupTeamsError } = await supabase
    .from("league_group_teams")
    .select("league_group_id, team_season_id, league_groups(id, league_id)")
    .in("team_season_id", [homeTeam.id, awayTeam.id])
    .is("deleted_at", null)
    .returns<LeagueGroupTeamRow[]>();
  if (groupTeamsError) throw groupTeamsError;

  const homeGroups = groupTeams?.filter((row) => row.team_season_id === homeTeam.id) ?? [];
  const awayGroups = groupTeams?.filter((row) => row.team_season_id === awayTeam.id) ?? [];
  const commonGroup = homeGroups.find((homeGroup) =>
    awayGroups.some((awayGroup) => awayGroup.league_group_id === homeGroup.league_group_id),
  );
  if (!commonGroup?.league_groups?.league_id) {
    throw new Error("Could not find a common league group for the isolated E2E teams.");
  }

  return {
    seasonId: homeMembership.season_id,
    leagueId: commonGroup.league_groups.league_id,
    groupId: commonGroup.league_group_id,
    homeTeam,
    awayTeam,
  };
}

async function insertMatchFixture(
  supabase: SupabaseClient,
  context: {
    seasonId: string;
    leagueId: string;
    groupId: string;
    homeTeam: TeamSeasonRow;
    awayTeam: TeamSeasonRow;
  },
) {
  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const matchInsert = {
    season_id: context.seasonId,
    league_id: context.leagueId,
    group_id: context.groupId,
    home_team_id: context.homeTeam.id,
    away_team_id: context.awayTeam.id,
    scheduled_at: scheduledAt,
    status: "scheduled",
    round_number: 999,
  };

  let matchResult = await supabase
    .from("matches")
    .insert(matchInsert)
    .select("id, home_team_id, away_team_id")
    .single<MatchRow>();

  if (matchResult.error?.message.includes("round_number")) {
    const fallbackInsert = {
      season_id: matchInsert.season_id,
      league_id: matchInsert.league_id,
      group_id: matchInsert.group_id,
      home_team_id: matchInsert.home_team_id,
      away_team_id: matchInsert.away_team_id,
      scheduled_at: matchInsert.scheduled_at,
      status: matchInsert.status,
    };
    matchResult = await supabase
      .from("matches")
      .insert(fallbackInsert)
      .select("id, home_team_id, away_team_id")
      .single<MatchRow>();
  }

  if (matchResult.error || !matchResult.data) {
    throw matchResult.error ?? new Error("Could not insert isolated E2E match.");
  }

  const gameRows = defaultGames(matchResult.data.id);
  const { data: games, error: gamesError } = await supabase
    .from("match_games")
    .insert(gameRows)
    .select("id, order_number")
    .returns<MatchGameRow[]>();
  if (gamesError) throw gamesError;

  return { match: matchResult.data, games: games ?? [] };
}

function defaultGames(matchId: string) {
  return Array.from({ length: 19 }, (_, index) => {
    const orderNumber = index + 1;
    return {
      match_id: matchId,
      order_number: orderNumber,
      game_type:
        orderNumber <= 8 || (orderNumber >= 11 && orderNumber <= 18)
          ? "singles"
          : orderNumber === 9
            ? "doubles"
            : orderNumber === 10
              ? "cricket"
              : "tiebreak_701",
      home_legs: 0,
      away_legs: 0,
      winner_side: null,
    };
  });
}

async function cleanupMatchFixture(supabase: SupabaseClient, matchId: string, testInfo: TestInfo) {
  const deletedAt = new Date().toISOString();
  const results = await Promise.all([
    supabase.from("match_confirmations").update({ deleted_at: deletedAt }).eq("match_id", matchId).is("deleted_at", null),
    supabase.from("match_block_lineup_reveals").update({ deleted_at: deletedAt }).eq("match_id", matchId).is("deleted_at", null),
    supabase.from("match_game_achievements").update({ deleted_at: deletedAt }).eq("match_id", matchId).is("deleted_at", null),
    cleanupMatchGamePlayers(supabase, matchId, deletedAt),
    supabase.from("match_results").update({ deleted_at: deletedAt }).eq("match_id", matchId).is("deleted_at", null),
    supabase.from("match_games").update({ deleted_at: deletedAt }).eq("match_id", matchId).is("deleted_at", null),
    supabase.from("matches").update({ deleted_at: deletedAt }).eq("id", matchId).is("deleted_at", null),
  ]);

  const errors = results
    .map((result) => result.error)
    .filter((error): error is NonNullable<typeof error> => Boolean(error));
  if (errors.length > 0) {
    await testInfo.attach("isolated-match-cleanup-error.json", {
      body: JSON.stringify(errors.map((error) => error.message), null, 2),
      contentType: "application/json",
    });
    throw new Error(`Isolated match cleanup failed: ${errors.map((error) => error.message).join("; ")}`);
  }

  const verification = await verifyFixtureCleanup(supabase, matchId);
  await testInfo.attach("isolated-match-cleanup.json", {
    body: JSON.stringify(verification, null, 2),
    contentType: "application/json",
  });
  if (!verification.cleaned) {
    throw new Error("Isolated match cleanup verification failed.");
  }
}

async function cleanupMatchGamePlayers(supabase: SupabaseClient, matchId: string, deletedAt: string) {
  const { data: games, error: gamesError } = await supabase
    .from("match_games")
    .select("id")
    .eq("match_id", matchId);
  if (gamesError) return { error: gamesError };

  const gameIds = (games ?? []).map((game) => game.id);
  if (gameIds.length === 0) return { error: null };

  return supabase
    .from("match_game_players")
    .update({ deleted_at: deletedAt })
    .in("match_game_id", gameIds)
    .is("deleted_at", null);
}

async function verifyFixtureCleanup(supabase: SupabaseClient, matchId: string) {
  const matchGames = await supabase.from("match_games").select("id").eq("match_id", matchId).is("deleted_at", null);
  const achievements = await supabase.from("match_game_achievements").select("id").eq("match_id", matchId).is("deleted_at", null);
  const reveals = await supabase.from("match_block_lineup_reveals").select("id").eq("match_id", matchId).is("deleted_at", null);
  const result = await supabase.from("match_results").select("id").eq("match_id", matchId).is("deleted_at", null);
  const match = await supabase.from("matches").select("id").eq("id", matchId).is("deleted_at", null);

  const counts = {
    matches: match.data?.length ?? 0,
    match_games: matchGames.data?.length ?? 0,
    match_game_achievements: achievements.data?.length ?? 0,
    match_block_lineup_reveals: reveals.data?.length ?? 0,
    match_results: result.data?.length ?? 0,
  };

  return {
    counts,
    cleaned: Object.values(counts).every((count) => count === 0),
  };
}
