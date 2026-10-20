import {
  Bell,
  Building2,
  House,
  Plane,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for app navigation.
 * Module sessions add or edit their own entry only.
 */
export type NavItem = {
  id: string;
  href: `/${string}`;
  label: string;
  icon: LucideIcon;
  /** Desktop sidebar section. */
  group: "main" | "you";
  /** Shown in the phone bottom bar. Everything else lives under "More". */
  phone: boolean;
  /** Short description used on the phone "More" screen. */
  description: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "today",
    href: "/",
    label: "Today",
    icon: House,
    group: "main",
    phone: true,
    description: "What needs you today",
  },
  {
    id: "housing",
    href: "/housing",
    label: "Housing",
    icon: Building2,
    group: "main",
    phone: true,
    description: "Cost Rental listings and applications",
  },
  {
    id: "money",
    href: "/money",
    label: "Money",
    icon: Wallet,
    group: "main",
    phone: true,
    description: "Bills, tax evidence and utility contracts",
  },
  {
    id: "family",
    href: "/family",
    label: "Family",
    icon: Users,
    group: "main",
    phone: true,
    description: "Week, tasks, lists and school places",
  },
  {
    id: "travel",
    href: "/travel",
    label: "Travel",
    icon: Plane,
    group: "main",
    phone: false,
    description: "Trip planner and cost comparison",
  },
  {
    id: "inbox",
    href: "/inbox",
    label: "Inbox",
    icon: Bell,
    group: "you",
    phone: false,
    description: "Alerts and updates",
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    icon: Settings,
    group: "you",
    phone: false,
    description: "Theme, alerts, household, background jobs",
  },
];

export const MORE_HREF = "/more";

/** The nav item a path belongs to, matching the longest prefix. */
export function activeNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS.find((item) => item.href === "/");
  return NAV_ITEMS.filter((item) => item.href !== "/")
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Whether the phone "More" tab should show as active for this path. */
export function isUnderMore(pathname: string): boolean {
  if (pathname === MORE_HREF) return true;
  const item = activeNavItem(pathname);
  return item !== undefined && !item.phone;
}
