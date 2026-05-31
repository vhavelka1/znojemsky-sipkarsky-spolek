"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/admin", label: "Přehled" },
  { href: "/admin/players", label: "Hráči" },
  { href: "/admin/teams", label: "Týmy" },
  { href: "/admin/seasons", label: "Sezóny" },
  { href: "/admin/memberships", label: "Členství" },
  { href: "/admin/leagues", label: "Ligy" },
  { href: "/admin/matches", label: "Zápasy" },
  { href: "/admin/tables", label: "Tabulky" },
  { href: "/admin/settings", label: "Nastavení" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {navigationItems.map((item) => {
        const isActive = isActivePath(pathname, item.href);

        return (
          <Link
            className={
              isActive
                ? "admin-nav-link-active whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold"
                : "admin-nav-link whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold"
            }
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
