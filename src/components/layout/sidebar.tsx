"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavItem, NAV_ITEMS, type NavItem } from "@/modules/nav";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium text-fg hover:bg-surface",
        active && "bg-accent/18 hover:bg-accent/18",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-[18px] text-muted", active && "text-accent")}
      />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const main = NAV_ITEMS.filter((item) => item.group === "main");
  const you = NAV_ITEMS.filter((item) => item.group === "you");

  return (
    <aside
      aria-label="Main navigation"
      className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto border-r border-line bg-sunk px-3 py-[18px] lg:flex"
    >
      <Link href="/" className="px-2 pt-1 pb-4">
        <Brand />
      </Link>
      <nav className="flex flex-col gap-1">
        {main.map((item) => (
          <SidebarLink
            key={item.id}
            item={item}
            active={active?.id === item.id}
          />
        ))}
        <div className="label mx-2 mt-3.5 mb-1">You</div>
        {you.map((item) => (
          <SidebarLink
            key={item.id}
            item={item}
            active={active?.id === item.id}
          />
        ))}
      </nav>
    </aside>
  );
}
