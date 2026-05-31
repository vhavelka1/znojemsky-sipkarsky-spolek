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

type SettingsBody = Parameters<typeof toPublicHomepageSettings>[0];

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
