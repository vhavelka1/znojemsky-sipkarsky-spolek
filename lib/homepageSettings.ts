import { promises as fs } from "node:fs";
import path from "node:path";

export type PublicHomepageSettings = {
  kicker: string;
  title: string;
  subtitle: string;
  teamRegistrationIntro: string;
};

export type AdminHomepageSettings = {
  homepageKicker: string;
  homepageTitle: string;
  homepageSubtitle: string;
  teamRegistrationIntro: string;
};

export type SettingRow = {
  key: string;
  value: string;
};

export const defaultHomepageSettings: PublicHomepageSettings = {
  kicker: "Regionální šipková liga",
  title: "Znojemský šipkařský spolek",
  subtitle: "Oficiální systém lig, turnajů a statistik.",
  teamRegistrationIntro:
    "Formulář pro registraci týmu do Znojemské šipkařské týmové ligy pro sezonu 2026/2027.\n\nRegistrační poplatek na sezonu je stanoven na 1500 Kč. Uhrazení proběhne na účet Znojemského šipkařského spolku. Do poznámky pro příjemce uvést název týmu.\nČ. účtu: 246898551\nKód banky: 0/600\n\nTermín odevzdání přihlášek je stanoven na 31. 7. 2026",
};

export const homepageSettingKeys = {
  kicker: "homepage_kicker",
  title: "homepage_title",
  subtitle: "homepage_subtitle",
  teamRegistrationIntro: "team_registration_intro",
} as const;

const localSettingsPath = path.join(process.cwd(), "data", "homepage-settings.json");

function clean(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 180) : fallback;
}

function cleanLongText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 3000) : fallback;
}

export function normalizePublicHomepageSettings(
  settings: Partial<PublicHomepageSettings>,
) {
  return {
    kicker: clean(settings.kicker, defaultHomepageSettings.kicker),
    title: clean(settings.title, defaultHomepageSettings.title),
    subtitle: clean(settings.subtitle, defaultHomepageSettings.subtitle),
    teamRegistrationIntro: cleanLongText(
      settings.teamRegistrationIntro,
      defaultHomepageSettings.teamRegistrationIntro,
    ),
  };
}

export function publicSettingsFromRows(rows: SettingRow[] | null) {
  const values = new Map((rows ?? []).map((row) => [row.key, row.value]));

  return normalizePublicHomepageSettings({
    kicker: values.get(homepageSettingKeys.kicker),
    title: values.get(homepageSettingKeys.title),
    subtitle: values.get(homepageSettingKeys.subtitle),
    teamRegistrationIntro: values.get(homepageSettingKeys.teamRegistrationIntro),
  });
}

export function toAdminHomepageSettings(
  settings: PublicHomepageSettings,
): AdminHomepageSettings {
  return {
    homepageKicker: settings.kicker,
    homepageTitle: settings.title,
    homepageSubtitle: settings.subtitle,
    teamRegistrationIntro: settings.teamRegistrationIntro,
  };
}

export function toPublicHomepageSettings(
  settings: Partial<AdminHomepageSettings>,
): PublicHomepageSettings {
  return normalizePublicHomepageSettings({
    kicker: settings.homepageKicker,
    title: settings.homepageTitle,
    subtitle: settings.homepageSubtitle,
    teamRegistrationIntro: settings.teamRegistrationIntro,
  });
}

export function toSettingRows(settings: PublicHomepageSettings) {
  return [
    { key: homepageSettingKeys.kicker, value: settings.kicker, deleted_at: null },
    { key: homepageSettingKeys.title, value: settings.title, deleted_at: null },
    { key: homepageSettingKeys.subtitle, value: settings.subtitle, deleted_at: null },
    { key: homepageSettingKeys.teamRegistrationIntro, value: settings.teamRegistrationIntro, deleted_at: null },
  ];
}

export async function readLocalHomepageSettings() {
  try {
    const raw = await fs.readFile(localSettingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PublicHomepageSettings>;
    return normalizePublicHomepageSettings(parsed);
  } catch {
    return defaultHomepageSettings;
  }
}

export async function writeLocalHomepageSettings(settings: PublicHomepageSettings) {
  await fs.mkdir(path.dirname(localSettingsPath), { recursive: true });
  await fs.writeFile(
    localSettingsPath,
    `${JSON.stringify(normalizePublicHomepageSettings(settings), null, 2)}\n`,
    "utf8",
  );
}

export function isMissingHomepageSettingsTable(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("schema cache") ||
    normalized.includes("does not exist") ||
    normalized.includes("could not find the table") ||
    normalized.includes("relation") && normalized.includes("app_settings")
  );
}
