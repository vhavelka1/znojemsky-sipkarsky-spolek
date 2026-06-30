"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminPages, adminRoleLabels, type AdminRole } from "@/lib/adminPages";

export type AdminNavigationItem = {
  key?: string;
  href: string;
  label: string;
  minimumRole: AdminRole;
  isAlert?: boolean;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation({ items }: { items?: AdminNavigationItem[] }) {
  const pathname = usePathname();
  const navigationItems: AdminNavigationItem[] = items ?? adminPages.map((page) => ({ key: page.key, href: page.href, label: page.label, minimumRole: page.defaultMinimumRole }));

  return (
    <nav className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-hidden lg:pb-0">
      {navigationItems.map((item) => {
        const isActive = isActivePath(pathname, item.href);

        return (
          <Link
            className={
              isActive
                ? `admin-nav-link-active whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold ${item.isAlert ? "text-[#EF233C]" : ""}`
                : item.isAlert
                  ? "admin-nav-link whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold text-[#EF233C]"
                  : "admin-nav-link whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold"
            }
            href={item.href}
            key={item.href}
            style={{ ["--admin-nav-role-color" as string]: roleColor(item.minimumRole) }}
            title={`Minimální oprávnění: ${adminRoleLabels[item.minimumRole]}`}
          >
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function roleColor(role: AdminRole) {
  if (role === "player") return "#16A34A";
  if (role === "moderator") return "#E2C57A";
  return "#EF233C";
}
