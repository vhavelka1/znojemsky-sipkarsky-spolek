import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type Season = { id: string; name: string; is_active: boolean; starts_on: string };
type League = { id: string; season_id: string; name: string };
type Team = { id: string; name: string; slug: string; deleted_at?: string | null };
type TeamSeason = { id: string; team_id: string; season_id: string; display_name: string | null; deleted_at?: string | null };
type Group = { id: string; league_id: string; name: string; sort_order: number };

type ImportRow = {
  group: string;
  round: number;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  byeTeam: string;
};

const headerAliases: Record<string, keyof ImportRow | "season" | null> = {
  season: "season",
  sezona: "season",
  group: "group",
  skupina: "group",
  round: "round",
  kolo: "round",
  date: "date",
  datum: "date",
  time: "time",
  cas: "time",
  home_team: "homeTeam",
  domaci: "homeTeam",
  away_team: "awayTeam",
  hoste: "awayTeam",
  bye_team: "byeTeam",
  volno: "byeTeam",
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " a ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSlug(name: string) {
  return normalize(name).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || crypto.randomUUID();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV musí obsahovat hlavičku a alespoň jeden zápas.");
  }

  const mappedHeaders = parseCsvLine(lines[0]).map((header) => headerAliases[normalize(header)] ?? null);
  const requiredHeaders: Array<keyof ImportRow> = ["group", "round", "date", "time", "homeTeam", "awayTeam"];
  const missingHeaders = requiredHeaders.filter((header) => !mappedHeaders.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error("CSV nemá požadované sloupce: skupina, kolo, datum, cas, domaci, hoste.");
  }

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: Partial<Record<keyof ImportRow, string>> = {};

    mappedHeaders.forEach((header, headerIndex) => {
      if (header && header !== "season") row[header] = values[headerIndex] ?? "";
    });

    const round = Number(row.round);
    if (!Number.isInteger(round) || round <= 0) {
      throw new Error(`Řádek ${index + 2}: kolo musí být kladné číslo.`);
    }

    const parsed = {
      group: (row.group ?? "").trim(),
      round,
      date: (row.date ?? "").trim(),
      time: (row.time ?? "").trim(),
      homeTeam: (row.homeTeam ?? "").trim(),
      awayTeam: (row.awayTeam ?? "").trim(),
      byeTeam: (row.byeTeam ?? "").trim(),
    };

    if (!parsed.group || !parsed.date || !parsed.time || !parsed.homeTeam || !parsed.awayTeam) {
      throw new Error(`Řádek ${index + 2}: vyplňte skupinu, kolo, datum, čas, domácí a hosty.`);
    }

    if (normalize(parsed.homeTeam) === normalize(parsed.awayTeam)) {
      throw new Error(`Řádek ${index + 2}: tým nemůže hrát sám proti sobě.`);
    }

    return parsed;
  });
}

function parseCzechDate(dateText: string) {
  const match = dateText.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) throw new Error(`Neplatné datum: ${dateText}. Použijte formát 11. 9. 2026.`);
  return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
}

function parseTime(timeText: string) {
  const match = timeText.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Neplatný čas: ${timeText}. Použijte formát 19:00.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Neplatný čas: ${timeText}. Použijte formát 19:00.`);
  return { hour, minute };
}

function pragueOffsetMilliseconds(utcDate: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const pragueAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return pragueAsUtc - utcDate.getTime();
}

function pragueDateTimeIso(dateText: string, timeText: string) {
  const { day, month, year } = parseCzechDate(dateText);
  const { hour, minute } = parseTime(timeText);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = pragueOffsetMilliseconds(new Date(wallClockAsUtc));
  return new Date(wallClockAsUtc - offset).toISOString();
}

function validateRows(rows: ImportRow[]) {
  const byGroupRound = new Map<string, ImportRow[]>();

  rows.forEach((row) => {
    const key = `${row.group}|${row.round}`;
    byGroupRound.set(key, [...(byGroupRound.get(key) ?? []), row]);
  });

  for (const [key, roundRows] of byGroupRound.entries()) {
    const [group, round] = key.split("|");
    const teams = roundRows.flatMap((row) => [normalize(row.homeTeam), normalize(row.awayTeam)]);
    const duplicateTeams = teams.filter((team, index) => teams.indexOf(team) !== index);

    if (duplicateTeams.length > 0) {
      throw new Error(`Skupina ${group}, ${round}. kolo: některý tým je v kole vícekrát.`);
    }
  }
}

async function loadTeamsAndSeasons(supabase: ReturnType<typeof createSupabaseAdminClient>, seasonId: string) {
  const [{ data: teams, error: teamsError }, { data: teamSeasons, error: teamSeasonsError }] = await Promise.all([
    supabase.from("teams").select("id, name, slug, deleted_at").returns<Team[]>(),
    supabase
      .from("team_seasons")
      .select("id, team_id, season_id, display_name, deleted_at")
      .eq("season_id", seasonId)
      .returns<TeamSeason[]>(),
  ]);

  if (teamsError || teamSeasonsError) throw new Error(teamsError?.message ?? teamSeasonsError?.message);
  return { teams: teams ?? [], teamSeasons: teamSeasons ?? [] };
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  const supabase = createSupabaseAdminClient();
  const [seasons, leagues] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, is_active, starts_on")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .returns<Season[]>(),
    supabase
      .from("leagues")
      .select("id, season_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<League[]>(),
  ]);

  const error = seasons.error ?? leagues.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ seasons: seasons.data ?? [], leagues: leagues.data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request);
  if (guard.response) return guard.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const seasonId = String(formData.get("season_id") ?? "").trim();
    const leagueId = String(formData.get("league_id") ?? "").trim();

    if (!seasonId || !leagueId) return NextResponse.json({ error: "Vyberte sezonu a ligu." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Vyberte CSV soubor." }, { status: 400 });

    const rows = parseCsv(await file.text());
    validateRows(rows);

    const supabase = createSupabaseAdminClient();
    const [{ data: league, error: leagueError }, existingMatches] = await Promise.all([
      supabase
        .from("leagues")
        .select("id, season_id")
        .eq("id", leagueId)
        .is("deleted_at", null)
        .single<{ id: string; season_id: string }>(),
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("season_id", seasonId)
        .eq("league_id", leagueId)
        .is("deleted_at", null),
    ]);

    if (leagueError || existingMatches.error) throw new Error(leagueError?.message ?? existingMatches.error?.message);
    if (!league || league.season_id !== seasonId) {
      return NextResponse.json({ error: "Vybraná liga nepatří do zvolené sezony." }, { status: 400 });
    }
    if ((existingMatches.count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Vybraná liga už obsahuje ${existingMatches.count} aktivních zápasů. Import by vytvořil duplicity.` },
        { status: 409 },
      );
    }

    async function getOrCreateGroup(groupCode: string) {
      const name = normalize(groupCode).startsWith("skupina") ? groupCode : `Skupina ${groupCode}`;
      const { data: existing, error: lookupError } = await supabase
        .from("league_groups")
        .select("id, league_id, name, sort_order")
        .eq("league_id", leagueId)
        .ilike("name", name)
        .is("deleted_at", null)
        .maybeSingle<Group>();

      if (lookupError) throw new Error(lookupError.message);
      if (existing) return existing;

      const { count, error: countError } = await supabase
        .from("league_groups")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .is("deleted_at", null);
      if (countError) throw new Error(countError.message);

      const { data, error } = await supabase
        .from("league_groups")
        .insert({ league_id: leagueId, name, sort_order: count ?? 0 })
        .select("id, league_id, name, sort_order")
        .single<Group>();
      if (error) throw new Error(error.message);
      return data;
    }

    async function ensureTeamSeason(teamName: string) {
      const { teams, teamSeasons } = await loadTeamsAndSeasons(supabase, seasonId);
      const normalizedName = normalize(teamName);
      const existingTeamSeason = teamSeasons.find((teamSeason) => {
        if (teamSeason.deleted_at) return false;
        const team = teams.find((item) => item.id === teamSeason.team_id);
        return normalize(teamSeason.display_name || team?.name) === normalizedName;
      });

      if (existingTeamSeason) return existingTeamSeason;

      let team = teams.find((item) => !item.deleted_at && normalize(item.name) === normalizedName);
      if (!team) {
        const { data: createdTeam, error: createTeamError } = await supabase
          .from("teams")
          .insert({ name: teamName, slug: createSlug(teamName) })
          .select("id, name, slug")
          .single<Team>();
        if (createTeamError) throw new Error(createTeamError.message);
        team = createdTeam;
      }

      const { data: createdTeamSeason, error: createTeamSeasonError } = await supabase
        .from("team_seasons")
        .insert({ team_id: team.id, season_id: seasonId, display_name: teamName })
        .select("id, team_id, season_id, display_name")
        .single<TeamSeason>();
      if (createTeamSeasonError) throw new Error(createTeamSeasonError.message);
      return createdTeamSeason;
    }

    const groups = new Map<string, Group>();
    const teamSeasons = new Map<string, TeamSeason>();

    for (const row of rows) {
      if (!groups.has(row.group)) groups.set(row.group, await getOrCreateGroup(row.group));

      for (const teamName of [row.homeTeam, row.awayTeam, row.byeTeam].filter(Boolean)) {
        const key = normalize(teamName);
        if (!teamSeasons.has(key)) teamSeasons.set(key, await ensureTeamSeason(teamName));
      }
    }

    for (const [teamKey, teamSeason] of teamSeasons) {
      const groupCodes = new Set(
        rows
          .filter((row) => [row.homeTeam, row.awayTeam, row.byeTeam].some((teamName) => normalize(teamName) === teamKey))
          .map((row) => row.group),
      );

      for (const groupCode of groupCodes) {
        const group = groups.get(groupCode)!;
        const { data: existing, error: lookupError } = await supabase
          .from("league_group_teams")
          .select("id")
          .eq("league_group_id", group.id)
          .eq("team_season_id", teamSeason.id)
          .is("deleted_at", null)
          .maybeSingle<{ id: string }>();

        if (lookupError) throw new Error(lookupError.message);
        if (!existing) {
          const { error } = await supabase.from("league_group_teams").insert({
            league_group_id: group.id,
            team_season_id: teamSeason.id,
          });
          if (error) throw new Error(error.message);
        }
      }
    }

    const matchRows = rows.map((row) => ({
      season_id: seasonId,
      league_id: leagueId,
      group_id: groups.get(row.group)!.id,
      home_team_id: teamSeasons.get(normalize(row.homeTeam))!.id,
      away_team_id: teamSeasons.get(normalize(row.awayTeam))!.id,
      round_number: row.round,
      scheduled_at: pragueDateTimeIso(row.date, row.time),
      status: "scheduled",
    }));

    for (let index = 0; index < matchRows.length; index += 100) {
      const { error } = await supabase.from("matches").insert(matchRows.slice(index, index + 100));
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ imported: matchRows.length, groups: groups.size, teams: teamSeasons.size });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import zápasů se nepodařil." },
      { status: 400 },
    );
  }
}
