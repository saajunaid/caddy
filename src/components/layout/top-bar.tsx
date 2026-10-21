import Link from "next/link";
import { Bell } from "lucide-react";
import { Brand } from "./brand";

export function TopBar({ unread = 0 }: { unread?: number }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-sunk pt-[calc(env(safe-area-inset-top,0px)+10px)] pr-[max(16px,env(safe-area-inset-right,0px))] pb-2.5 pl-[max(16px,env(safe-area-inset-left,0px))] lg:hidden">
      <Link href="/">
        <Brand />
      </Link>
      <span className="flex-1" />
      <Link
        href="/inbox"
        aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
        className="grid size-10 place-items-center rounded-[10px] text-fg hover:bg-surface"
      >
        <span className="relative">
          <Bell aria-hidden="true" className="size-5" />
          {unread ? (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-mine" />
          ) : null}
        </span>
      </Link>
    </header>
  );
}
