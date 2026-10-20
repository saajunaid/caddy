import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** Phone: sticky top bar + bottom tabs. Desktop (lg and up): left sidebar + content column. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)]">
      <Sidebar />
      <div className="min-w-0">
        <TopBar />
        <OfflineBanner />
        <main
          id="main"
          className="pt-5 pr-[max(16px,env(safe-area-inset-right,0px))] pb-[calc(var(--nav-h)+28px+env(safe-area-inset-bottom,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] lg:px-9 lg:pt-7 lg:pb-12"
        >
          <div className="mx-auto grid max-w-[1120px] gap-[22px] [&>*]:min-w-0">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
