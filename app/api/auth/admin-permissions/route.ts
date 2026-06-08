import { NextResponse } from "next/server";
import { adminPages, isAdminRole } from "@/lib/adminPages";
import { getCurrentUserProfile } from "@/lib/appAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type PermissionRow = {
  page_key: string;
  minimum_role: string;
};

function mergePermissions(rows: PermissionRow[] | null | undefined) {
  const minimumRolesByKey = new Map((rows ?? []).map((row) => [row.page_key, row.minimum_role]));

  return adminPages.map((page) => {
    const configuredRole = minimumRolesByKey.get(page.key);
    const minimumRole = configuredRole && isAdminRole(configuredRole) ? configuredRole : page.defaultMinimumRole;

    return {
      key: page.key,
      href: page.href,
      label: page.label,
      minimumRole,
    };
  });
}

export async function GET(request: Request) {
  const profile = await getCurrentUserProfile(request);

  if (!profile || !profile.isActive) {
    return NextResponse.json({ error: "Pro tuto akci se nejprve přihlaste." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("admin_page_permissions")
    .select("page_key, minimum_role")
    .is("deleted_at", null);

  return NextResponse.json({
    role: profile.role,
    permissions: mergePermissions(data),
  });
}
