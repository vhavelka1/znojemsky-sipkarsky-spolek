"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminPages, adminRoleLabels, type AdminRole } from "@/lib/adminPages";

export type AdminNavigationItem = {
  key?: string;
  href: string;
  label: string;
  minimumRole: AdminRole;
  parentKey?: string;
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
  const navigationItems: AdminNavigationItem[] =
    items ??
    adminPages.map((page) => ({
      key: page.key,
      href: page.href,
      label: page.label,
      minimumRole: page.defaultMinimumRole,
      parentKey: page.parentKey,
    }));
  const rootItems = navigationItems.filter((item) => !item.parentKey);
  const childrenByParentKey = new Map<string, AdminNavigationItem[]>();

  navigationItems.forEach((item) => {
    if (!item.parentKey) return;
    childrenByParentKey.set(item.parentKey, [...(childrenByParentKey.get(item.parentKey) ?? []), item]);
  });

  return (
    <nav className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-hidden lg:pb-0">
      {rootItems.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const children = item.key ? childrenByParentKey.get(item.key) ?? [] : [];
        const isChildActive = children.some((child) => isActivePath(pathname, child.href));

        return (
          <div className="flex shrink-0 flex-col gap-1 lg:shrink" key={item.href}>
            <Link
              className={
                isActive || isChildActive
                  ? `admin-nav-link-active whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold ${item.isAlert ? "text-[#EF233C]" : ""}`
                  : item.isAlert
                    ? "admin-nav-link whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold text-[#EF233C]"
                    : "admin-nav-link whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold"
              }
              href={item.href}
              style={{ ["--admin-nav-role-color" as string]: roleColor(item.minimumRole) }}
              title={`Minimální oprávnění: ${adminRoleLabels[item.minimumRole]}`}
            >
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
            {children.length > 0 && (isActive || isChildActive) ? (
              <div className="flex gap-1 pl-3 lg:flex-col">
                {children.map((child) => {
                  const childActive = isActivePath(pathname, child.href);

                  return (
                    <Link
                      className={
                        childActive
                          ? "rounded-lg bg-white/15 px-3 py-2 text-xs font-black text-white"
                          : "rounded-lg px-3 py-2 text-xs font-bold text-blue-100/80 hover:bg-white/10 hover:text-white"
                      }
                      href={child.href}
                      key={child.href}
                      title={`Minimální oprávnění: ${adminRoleLabels[child.minimumRole]}`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
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
