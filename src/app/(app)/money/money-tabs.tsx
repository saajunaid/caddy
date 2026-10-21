"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/money",
    label: "Bills",
    match: (p: string) =>
      p === "/money" ||
      p.startsWith("/money/bills") ||
      p.startsWith("/money/expenses"),
  },
  {
    href: "/money/tax",
    label: "Tax",
    match: (p: string) => p.startsWith("/money/tax"),
  },
  {
    href: "/money/utilities",
    label: "Utilities",
    match: (p: string) => p.startsWith("/money/utilities"),
  },
] as const;

/** Bills · Tax · Utilities. The active tab follows the URL. */
export function MoneyTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Money sections"
      className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line print:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex-none border-b-2 px-3 py-2.5 font-semibold",
              active
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
