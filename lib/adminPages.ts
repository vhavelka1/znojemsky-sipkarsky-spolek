export type AdminRole = "player" | "captain" | "moderator" | "admin";

export type AdminPageDefinition = {
  key: string;
  href: string;
  label: string;
  defaultMinimumRole: AdminRole;
};

export const adminRoleWeight: Record<AdminRole, number> = {
  player: 1,
  captain: 2,
  moderator: 3,
  admin: 4,
};

export const adminRoleLabels: Record<AdminRole, string> = {
  player: "Hráč",
  captain: "Kapitán",
  moderator: "Moderátor",
  admin: "Administrátor",
};

export const adminRoleShortLabels: Record<AdminRole, string> = {
  player: "Hráč",
  captain: "Kapitán",
  moderator: "Mod.",
  admin: "Admin",
};

export const adminPages: AdminPageDefinition[] = [
  { key: "dashboard", href: "/admin", label: "Přehled", defaultMinimumRole: "moderator" },
  { key: "teams", href: "/admin/teams", label: "Týmy", defaultMinimumRole: "moderator" },
  { key: "rosters", href: "/admin/rosters", label: "Soupisky", defaultMinimumRole: "moderator" },
  { key: "players", href: "/admin/players", label: "Hráči", defaultMinimumRole: "moderator" },
  { key: "memberships", href: "/admin/memberships", label: "Členství", defaultMinimumRole: "moderator" },
  { key: "seasons", href: "/admin/seasons", label: "Sezóny", defaultMinimumRole: "admin" },
  { key: "leagues", href: "/admin/leagues", label: "Ligy", defaultMinimumRole: "moderator" },
  { key: "matches", href: "/admin/matches", label: "Zápasy", defaultMinimumRole: "moderator" },
  { key: "tables", href: "/admin/tables", label: "Tabulky", defaultMinimumRole: "moderator" },
  { key: "users", href: "/admin/users", label: "Uživatelé", defaultMinimumRole: "admin" },
  { key: "permissions", href: "/admin/permissions", label: "Práva", defaultMinimumRole: "admin" },
  { key: "settings", href: "/admin/settings", label: "Nastavení", defaultMinimumRole: "admin" },
];

export function isAdminRole(value: string): value is AdminRole {
  return value === "player" || value === "captain" || value === "moderator" || value === "admin";
}

export function canAccessAdminPage(userRole: string | null | undefined, minimumRole: AdminRole) {
  if (!userRole || !isAdminRole(userRole)) {
    return false;
  }

  return adminRoleWeight[userRole] >= adminRoleWeight[minimumRole];
}

export function adminPageForPath(pathname: string) {
  const sortedPages = [...adminPages].sort((left, right) => right.href.length - left.href.length);
  return sortedPages.find((page) => pathname === page.href || pathname.startsWith(`${page.href}/`)) ?? adminPages[0];
}

export function adminPageForAdminApiPath(pathname: string) {
  const mappings: Array<{ prefix: string; key: string }> = [
    { prefix: "/api/admin/dashboard", key: "dashboard" },
    { prefix: "/api/admin/teams", key: "teams" },
    { prefix: "/api/admin/rosters", key: "rosters" },
    { prefix: "/api/admin/players", key: "players" },
    { prefix: "/api/admin/memberships", key: "memberships" },
    { prefix: "/api/admin/seasons", key: "seasons" },
    { prefix: "/api/admin/leagues", key: "leagues" },
    { prefix: "/api/admin/matches", key: "matches" },
    { prefix: "/api/admin/tables", key: "tables" },
    { prefix: "/api/admin/users", key: "users" },
    { prefix: "/api/admin/permissions", key: "permissions" },
    { prefix: "/api/admin/settings", key: "settings" },
  ];

  const match = mappings.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  return adminPages.find((page) => page.key === match?.key) ?? adminPages[0];
}
