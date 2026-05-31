import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const mockRole = "admin";
const maximumLogoSize = 2 * 1024 * 1024;
const allowedLogoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function guardRequest() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Development-only admin API route." }, { status: 404 });
  }

  if (mockRole !== "admin") {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  return null;
}

function getAdminClientOrError() {
  try {
    return { supabase: createSupabaseAdminClient(), response: null };
  } catch (error) {
    return {
      supabase: null,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Server configuration error." },
        { status: 500 },
      ),
    };
  }
}

async function removePreviousLocalLogo(logoUrl: string | null) {
  if (!logoUrl?.startsWith("/team-logos/uploads/")) {
    return;
  }

  const filePath = path.join(process.cwd(), "public", ...logoUrl.split("/").filter(Boolean));
  await unlink(filePath).catch(() => undefined);
}

export async function POST(request: Request, context: RouteContext) {
  const guardResponse = guardRequest();
  if (guardResponse) {
    return guardResponse;
  }

  const formData = await request.formData();
  const logo = formData.get("logo");

  if (!(logo instanceof File)) {
    return NextResponse.json({ error: "Vyberte obrázek loga." }, { status: 400 });
  }

  const extension = allowedLogoTypes.get(logo.type);
  if (!extension) {
    return NextResponse.json({ error: "Logo musí být ve formátu PNG, JPG nebo WebP." }, { status: 400 });
  }

  if (logo.size > maximumLogoSize) {
    return NextResponse.json({ error: "Logo může mít nejvýše 2 MB." }, { status: 400 });
  }

  const { id } = await context.params;
  const { supabase, response } = getAdminClientOrError();
  if (response) {
    return response;
  }

  const { data: existingTeam, error: readError } = await supabase
    .from("teams")
    .select("logo_url")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (readError) {
    return NextResponse.json(
      {
        error: readError.message.includes("logo_url")
          ? "Nejprve spusťte SQL soubor supabase/apply_team_logos_in_dashboard.sql v Supabase SQL Editoru."
          : readError.message,
      },
      { status: 500 },
    );
  }

  const uploadsDirectory = path.join(process.cwd(), "public", "team-logos", "uploads");
  const fileName = `${id}-${crypto.randomUUID()}.${extension}`;
  const logoUrl = `/team-logos/uploads/${fileName}`;
  await mkdir(uploadsDirectory, { recursive: true });
  await writeFile(path.join(uploadsDirectory, fileName), Buffer.from(await logo.arrayBuffer()));

  const { data, error } = await supabase
    .from("teams")
    .update({ logo_url: logoUrl })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, slug, logo_url, created_at, updated_at, deleted_at")
    .single();

  if (error) {
    await unlink(path.join(uploadsDirectory, fileName)).catch(() => undefined);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await removePreviousLocalLogo(existingTeam.logo_url);
  return NextResponse.json({ team: data });
}
