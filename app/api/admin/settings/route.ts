import { NextResponse } from "next/server";
import {
  homepageSettingKeys,
  isMissingHomepageSettingsTable,
  publicSettingsFromRows,
  readLocalHomepageSettings,
  SettingRow,
  toAdminHomepageSettings,
  toPublicHomepageSettings,
  toSettingRows,
  writeLocalHomepageSettings,
} from "@/lib/homepageSettings";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";
const competitionDocumentsBucket = "competition-documents";
const maxRulesFileSize = 20 * 1024 * 1024;
const allowedRulesMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "text/plain",
]);
const allowedRulesExtensions = new Set(["pdf", "doc", "docx", "odt", "rtf", "txt"]);

type SettingsBody = Parameters<typeof toPublicHomepageSettings>[0];

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "pravidla-souteze";
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function rulesFileValidationError(file: File) {
  const extension = fileExtension(file.name);
  if (!allowedRulesExtensions.has(extension)) {
    return "Soubor pravidel musí být ve formátu PDF, Word, ODT, RTF nebo TXT.";
  }

  if (file.type && !allowedRulesMimeTypes.has(file.type)) {
    return "Soubor pravidel má nepodporovaný typ.";
  }

  if (file.size <= 0) {
    return "Soubor pravidel je prázdný.";
  }

  if (file.size > maxRulesFileSize) {
    return "Soubor pravidel může mít maximálně 20 MB.";
  }

  return null;
}

function developmentOnlyResponse() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_DEV_ADMIN === "true"
  ) {
    return null;
  }

  return NextResponse.json(
    { error: "Administrace není povolena." },
    { status: 403 },
  );
}

function mockAdminResponse() {
  if (mockRole === "admin") {
    return null;
  }

  return NextResponse.json(
    { error: "Pro tuto akci je potřeba role administrátora." },
    { status: 403 },
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

export async function GET() {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) return developmentResponse;

  const adminResponse = mockAdminResponse();
  if (adminResponse) return adminResponse;

  const { supabase, response } = getAdminClientOrError();
  if (response) return response;

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(homepageSettingKeys))
    .is("deleted_at", null)
    .returns<SettingRow[]>();

  if (error) {
    if (isMissingHomepageSettingsTable(error.message)) {
      const localSettings = await readLocalHomepageSettings();
      return NextResponse.json({
        settings: toAdminHomepageSettings(localSettings),
        notice:
          "Nastavení se zatím ukládá lokálně. Pro databázové uložení spusťte SQL soubor supabase/apply_homepage_settings_in_dashboard.sql v Supabase SQL Editoru.",
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    settings: toAdminHomepageSettings(publicSettingsFromRows(data)),
  });
}

export async function PATCH(request: Request) {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) return developmentResponse;

  const adminResponse = mockAdminResponse();
  if (adminResponse) return adminResponse;

  const { supabase, response } = getAdminClientOrError();
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as SettingsBody;
  const publicSettings = toPublicHomepageSettings(body);
  const settings = toAdminHomepageSettings(publicSettings);

  const { error } = await supabase
    .from("app_settings")
    .upsert(toSettingRows(publicSettings), { onConflict: "key" });

  if (error) {
    if (isMissingHomepageSettingsTable(error.message)) {
      await writeLocalHomepageSettings(publicSettings);
      return NextResponse.json({
        settings,
        notice:
          "Nastavení bylo uloženo lokálně. Pro databázové uložení spusťte SQL soubor supabase/apply_homepage_settings_in_dashboard.sql v Supabase SQL Editoru.",
      });
    }

    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const developmentResponse = developmentOnlyResponse();
  if (developmentResponse) return developmentResponse;

  const adminResponse = mockAdminResponse();
  if (adminResponse) return adminResponse;

  const { supabase, response } = getAdminClientOrError();
  if (response) return response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("rules_file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Vyberte soubor pravidel soutěže." }, { status: 400 });
  }

  const validationError = rulesFileValidationError(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const settingsResult = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(homepageSettingKeys))
    .is("deleted_at", null)
    .returns<SettingRow[]>();

  if (settingsResult.error) {
    return NextResponse.json({ error: settingsResult.error.message }, { status: 500 });
  }

  const currentSettings = publicSettingsFromRows(settingsResult.data);
  const safeFileName = sanitizeFileName(file.name);
  const storagePath = `rules/${Date.now()}-${safeFileName}`;
  const uploadResult = await supabase.storage.from(competitionDocumentsBucket).upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });

  if (uploadResult.error) {
    const message = uploadResult.error.message.includes("Bucket not found")
      ? "Nejprve spusťte SQL soubor supabase/apply_competition_documents_storage_in_dashboard.sql v Supabase SQL Editoru."
      : uploadResult.error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (currentSettings.competitionRulesStoragePath) {
    await supabase.storage
      .from(competitionDocumentsBucket)
      .remove([currentSettings.competitionRulesStoragePath])
      .catch(() => undefined);
  }

  const publicUrl = supabase.storage.from(competitionDocumentsBucket).getPublicUrl(storagePath).data.publicUrl;
  const publicSettings = {
    ...currentSettings,
    competitionRulesFileName: file.name,
    competitionRulesFileUrl: publicUrl,
    competitionRulesStoragePath: storagePath,
  };
  const settings = toAdminHomepageSettings(publicSettings);

  const saveResult = await supabase
    .from("app_settings")
    .upsert(toSettingRows(publicSettings), { onConflict: "key" });

  if (saveResult.error) {
    await supabase.storage.from(competitionDocumentsBucket).remove([storagePath]).catch(() => undefined);
    return NextResponse.json({ error: saveResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    settings,
    notice: "Soubor pravidel soutěže byl uložen.",
  });
}
