"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminPages } from "@/lib/adminPages";

export type AdminNavigationItem = {
  href: string;
  label: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation({ items }: { items?: AdminNavigationItem[] }) {
  const pathname = usePathname();
  const navigationItems = items ?? adminPages.map((page) => ({ href: page.href, label: page.label }));

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
