import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

/** Phone: bottom tabs only (no top bar), content padded below the status bar. Desktop (lg and up):
 * left sidebar + content column. */
export function AppShell({
  children,
  badges = {},
}: {
  children: ReactNode;
  /** Counts shown next to nav items, keyed by nav item id (e.g. { inbox: 3 }). */
  badges?: Record<string, number>;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)]">
      <Sidebar badges={badges} />
      <div className="min-w-0">
        <OfflineBanner />
        <main
          id="main"
          className="pt-[calc(env(safe-area-inset-top,0px)+20px)] pr-[max(16px,env(safe-area-inset-right,0px))] pb-[calc(var(--nav-h)+28px+env(safe-area-inset-bottom,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] lg:px-9 lg:pt-7 lg:pb-12"
        >
          <div className="mx-auto grid max-w-[1120px] gap-[22px] [&>*]:min-w-0">
            {children}
          </div>
        </main>
      </div>
      <BottomNav unread={badges.inbox ?? 0} />
    </div>
  );
}
