"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import {
  activeNavItem,
  isUnderMore,
  MORE_HREF,
  NAV_ITEMS,
} from "@/modules/nav";
import { cn } from "@/lib/utils";

const tabClass =
  "grid h-[var(--nav-h)] place-items-center content-center gap-0.5 text-[0.72rem] font-medium text-muted aria-[current=page]:text-accent";

export function BottomNav() {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const moreActive = isUnderMore(pathname);
  const tabs = NAV_ITEMS.filter((item) => item.phone);

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-sunk lg:hidden",
        "pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]",
      )}
      style={{
        gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
      }}
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const current = !moreActive && active?.id === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={tabClass}
          >
            <Icon aria-hidden="true" className="size-[22px]" />
            {item.label}
          </Link>
        );
      })}
      <Link
        href={MORE_HREF}
        aria-current={moreActive ? "page" : undefined}
        className={tabClass}
      >
        <Ellipsis aria-hidden="true" className="size-[22px]" />
        More
      </Link>
    </nav>
  );
}
