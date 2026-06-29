import { NextResponse } from "next/server";
import { homepageSettingKeys, publicSettingsFromRows, SettingRow } from "@/lib/homepageSettings";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type RegistrationType = "team" | "player";

type TeamRegistrationPlayerInput = {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  date_of_birth?: unknown;
  note?: unknown;
};

type RegistrationBody = {
  type?: unknown;
  website?: unknown;
  team_name?: unknown;
  captain_name?: unknown;
  captain_email?: unknown;
  captain_phone?: unknown;
  captain_address?: unknown;
  captain_date_of_birth?: unknown;
  assistant_captain_name?: unknown;
  assistant_captain_email?: unknown;
  assistant_captain_phone?: unknown;
  assistant_captain_address?: unknown;
  assistant_captain_date_of_birth?: unknown;
  wants_major_tournament?: unknown;
  note?: unknown;
  rules_accepted?: unknown;
  roster?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  residence?: unknown;
  date_of_birth?: unknown;
  looking_for_team?: unknown;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(value: unknown) {
  return optionalString(value);
}

function optionalEmail(value: unknown) {
  const email = optionalString(value);
  return email ? email.toLowerCase() : null;
}

function optionalDate(value: unknown) {
  const text = optionalString(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isSchemaCacheColumnError(message: string | undefined) {
  return Boolean(message?.includes("schema cache") && message.includes("column"));
}

async function activeSeasonId(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [seasons, leagues, groups, teams, settings] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, is_active, starts_on")
        .is("deleted_at", null)
        .order("starts_on", { ascending: false }),
      supabase
        .from("leagues")
        .select("id, season_id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("league_groups")
        .select("id, league_id, name, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("teams")
        .select("id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("app_settings")
        .select("key, value")
        .in("key", Object.values(homepageSettingKeys))
        .is("deleted_at", null)
        .returns<SettingRow[]>(),
    ]);

    const error = seasons.error ?? leagues.error ?? groups.error ?? teams.error;
    if (error) {
      return NextResponse.json({ error: "Data pro registraci se nepodařilo načíst." }, { status: 500 });
    }
    const publicSettings = settings.error ? publicSettingsFromRows(null) : publicSettingsFromRows(settings.data);

    return NextResponse.json({
      seasons: seasons.data ?? [],
      leagues: leagues.data ?? [],
      groups: groups.data ?? [],
      teams: teams.data ?? [],
      activeSeasonId: (seasons.data ?? []).find((season) => season.is_active)?.id ?? seasons.data?.[0]?.id ?? null,
      teamRegistrationIntro: publicSettings.teamRegistrationIntro,
    });
  } catch {
    return NextResponse.json({ error: "Data pro registraci se nepodařilo načíst." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as RegistrationBody | null;
    if (!body) {
      return NextResponse.json({ error: "Formulář se nepodařilo zpracovat." }, { status: 400 });
    }

    if (optionalString(body.website)) {
      return NextResponse.json({ error: "Žádost byla odmítnuta." }, { status: 400 });
    }

    if (body.rules_accepted !== true) {
      return NextResponse.json({ error: "Pro odeslání je potřeba souhlas s pravidly." }, { status: 400 });
    }

    const type = optionalString(body.type) as RegistrationType | null;
    const supabase = createSupabaseAdminClient();
    const seasonId = await activeSeasonId(supabase);

    if (type === "team") {
      const teamName = requiredString(body.team_name);
      const captainName = requiredString(body.captain_name);
      const captainEmail = optionalEmail(body.captain_email);
      const captainAddress = optionalString(body.captain_address);
      const captainDateOfBirth = optionalDate(body.captain_date_of_birth);
      const assistantCaptainName = optionalString(body.assistant_captain_name);
      const assistantCaptainEmail = optionalEmail(body.assistant_captain_email);
      const assistantCaptainPhone = optionalString(body.assistant_captain_phone);
      const assistantCaptainAddress = optionalString(body.assistant_captain_address);
      const assistantCaptainDateOfBirth = optionalDate(body.assistant_captain_date_of_birth);
      const hasAssistantCaptain = Boolean(
        assistantCaptainName ||
        assistantCaptainEmail ||
        assistantCaptainPhone ||
        assistantCaptainAddress ||
        assistantCaptainDateOfBirth,
      );
      const roster = Array.isArray(body.roster) ? body.roster : [];

      if (!teamName || !captainName || !isEmail(captainEmail)) {
        return NextResponse.json({ error: "Vyplňte název týmu, kapitána a platný email kapitána." }, { status: 400 });
      }

      if (!captainAddress || !captainDateOfBirth) {
        return NextResponse.json({ error: "Vyplňte adresu a datum narození kapitána." }, { status: 400 });
      }

      if (assistantCaptainEmail && !isEmail(assistantCaptainEmail)) {
        return NextResponse.json({ error: "Vyplňte platný email zástupce kapitána." }, { status: 400 });
      }

      if (hasAssistantCaptain && !assistantCaptainName) {
        return NextResponse.json({ error: "Vyplňte jméno zástupce kapitána." }, { status: 400 });
      }

      if (hasAssistantCaptain && (!assistantCaptainAddress || !assistantCaptainDateOfBirth)) {
        return NextResponse.json({ error: "Vyplňte adresu a datum narození zástupce kapitána." }, { status: 400 });
      }

      const players = roster
        .map((item): TeamRegistrationPlayerInput => (typeof item === "object" && item !== null ? item : {}))
        .map((player) => ({
          first_name: requiredString(player.first_name),
          last_name: requiredString(player.last_name),
          email: optionalEmail(player.email),
          phone: optionalString(player.phone),
          address: optionalString(player.address),
          date_of_birth: optionalDate(player.date_of_birth),
          note: optionalString(player.note),
        }))
        .filter((player) => player.first_name && player.last_name);

      if (players.length === 0) {
        return NextResponse.json({ error: "Přidejte alespoň jednoho hráče na soupisku." }, { status: 400 });
      }

      const teamRegistrationPayload = {
        season_id: seasonId,
        team_name: teamName,
        captain_name: captainName,
        captain_email: captainEmail,
        captain_phone: optionalString(body.captain_phone),
        captain_address: captainAddress,
        captain_date_of_birth: captainDateOfBirth,
        assistant_captain_name: assistantCaptainName,
        assistant_captain_email: assistantCaptainEmail,
        assistant_captain_phone: assistantCaptainPhone,
        assistant_captain_address: assistantCaptainAddress,
        assistant_captain_date_of_birth: assistantCaptainDateOfBirth,
        wants_major_tournament: body.wants_major_tournament === true,
        note: optionalString(body.note),
      };
      const fallbackTeamRegistrationPayload = {
        season_id: seasonId,
        team_name: teamName,
        captain_name: captainName,
        captain_email: captainEmail,
        captain_phone: optionalString(body.captain_phone),
        note: optionalString(body.note),
      };

      let registrationResult = await supabase
        .from("team_registration_requests")
        .insert(teamRegistrationPayload)
        .select("id")
        .single<{ id: string }>();

      if (isSchemaCacheColumnError(registrationResult.error?.message)) {
        registrationResult = await supabase
          .from("team_registration_requests")
          .insert(fallbackTeamRegistrationPayload)
          .select("id")
          .single<{ id: string }>();
      }

      const { data: registration, error } = registrationResult;

      if (error || !registration) {
        return NextResponse.json({ error: error?.message ?? "Žádost se nepodařilo odeslat." }, { status: 500 });
      }

      const playerRows = players.map((player) => ({
        request_id: registration.id,
        first_name: player.first_name,
        last_name: player.last_name,
        email: player.email,
        phone: player.phone,
        address: player.address,
        date_of_birth: player.date_of_birth,
        note: player.note,
        player_status: "pending",
      }));
      const fallbackPlayerRows = players.map((player) => ({
        request_id: registration.id,
        first_name: player.first_name,
        last_name: player.last_name,
        email: player.email,
        phone: player.phone,
        note: player.note,
        player_status: "pending",
      }));

      let playersResult = await supabase.from("team_registration_players").insert(playerRows);
      if (isSchemaCacheColumnError(playersResult.error?.message)) {
        playersResult = await supabase.from("team_registration_players").insert(fallbackPlayerRows);
      }

      const { error: playersError } = playersResult;

      if (playersError) {
        return NextResponse.json({ error: playersError.message }, { status: 500 });
      }

      return NextResponse.json({ message: "Žádost byla odeslána ke schválení." });
    }

    if (type === "player") {
      const firstName = requiredString(body.first_name);
      const lastName = requiredString(body.last_name);
      const email = optionalEmail(body.email);
      const residence = requiredString(body.residence);
      const dateOfBirth = optionalDate(body.date_of_birth);

      if (!firstName || !lastName || !isEmail(email) || !residence || !dateOfBirth) {
        return NextResponse.json({ error: "Vyplňte jméno, příjmení, platný email, bydliště a datum narození." }, { status: 400 });
      }

      const playerRegistrationPayload = {
        season_id: seasonId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: optionalString(body.phone),
        residence,
        date_of_birth: dateOfBirth,
        looking_for_team: body.looking_for_team === true,
        note: optionalString(body.note),
      };
      const fallbackPlayerRegistrationPayload = {
        season_id: seasonId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: optionalString(body.phone),
        looking_for_team: body.looking_for_team === true,
        note: optionalString(body.note),
      };

      let playerRegistrationResult = await supabase.from("player_registration_requests").insert(playerRegistrationPayload);
      if (isSchemaCacheColumnError(playerRegistrationResult.error?.message)) {
        playerRegistrationResult = await supabase.from("player_registration_requests").insert(fallbackPlayerRegistrationPayload);
      }

      const { error } = playerRegistrationResult;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ message: "Žádost byla odeslána ke schválení." });
    }

    return NextResponse.json({ error: "Vyberte platný typ registrace." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Žádost se nepodařilo odeslat." }, { status: 500 });
  }
}
