import { NextResponse } from "next/server";
import { adminPages, isAdminRole, type AdminRole } from "@/lib/adminPages";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type PermissionInput = {
  key?: unknown;
  minimumRole?: unknown;
};

type PermissionRow = {
  page_key: string;
  page_path: string;
  page_label: string;
  minimum_role: AdminRole;
};

function schemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("admin_page_permissions")
    ? "Nejprve spusťte SQL soubor supabase/apply_admin_page_permissions_in_dashboard.sql v Supabase SQL Editoru."
    : message;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("admin_page_permissions")
    .select("page_key, minimum_role")
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: schemaError(error), permissions: [] }, { status: 500 });
  }

  const configuredByKey = new Map((data ?? []).map((row) => [row.page_key, row.minimum_role]));

  return NextResponse.json({
    permissions: adminPages.map((page) => ({
      key: page.key,
      href: page.href,
      label: page.label,
      defaultMinimumRole: page.defaultMinimumRole,
      minimumRole: configuredByKey.get(page.key) ?? page.defaultMinimumRole,
    })),
  });
}

export async function PUT(request: Request) {
  const profile = await getCurrentUserProfile(request);

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Práva může spravovat pouze administrátor." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { permissions?: PermissionInput[] };
  const inputs = Array.isArray(body.permissions) ? body.permissions : [];
  const pagesByKey = new Map(adminPages.map((page) => [page.key, page]));

  const rows = inputs.map((input): PermissionRow | null => {
    const key = stringValue(input.key);
    const minimumRole = stringValue(input.minimumRole);
    const page = pagesByKey.get(key);

    if (!page || !isAdminRole(minimumRole)) {
      return null;
    }

    return {
      page_key: page.key,
      page_path: page.href,
      page_label: page.label,
      minimum_role: minimumRole,
    };
  });

  if (rows.some((row) => row === null)) {
    return NextResponse.json({ error: "Některá oprávnění nejsou platná." }, { status: 400 });
  }

  const validRows = rows.filter((row): row is PermissionRow => row !== null);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("admin_page_permissions")
    .upsert(validRows, { onConflict: "page_key" });

  if (error) {
    return NextResponse.json({ error: schemaError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
