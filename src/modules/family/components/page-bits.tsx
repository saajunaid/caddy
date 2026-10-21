import Link from "next/link";
import { CalendarPlus, ChevronDown, ListChecks, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { primaryButtonClass } from "./ui";

/** "Add" button with a small menu: event or task. Works without JavaScript. */
export function AddMenu({ date }: { date: string }) {
  return (
    <details className="relative">
      <summary
        className={`${primaryButtonClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add
        <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      <div className="absolute right-0 z-10 mt-1.5 grid w-48 overflow-hidden rounded-[10px] border border-line bg-surface shadow-lg">
        <Link
          href={`/family/events/new?date=${date}`}
          className="flex min-h-11 items-center gap-2.5 px-3.5 hover:bg-fg/5"
        >
          <CalendarPlus aria-hidden="true" className="size-4 text-muted" />
          Event
        </Link>
        <Link
          href={`/family/tasks/new?due=${date}`}
          className="flex min-h-11 items-center gap-2.5 border-t border-line px-3.5 hover:bg-fg/5"
        >
          <ListChecks aria-hidden="true" className="size-4 text-muted" />
          Task
        </Link>
      </div>
    </details>
  );
}

export function NoHousehold() {
  return (
    <Card className="grid gap-1 p-4">
      <h2 className="text-[1.05rem] font-semibold">
        Your account isn&apos;t linked yet
      </h2>
      <p className="text-muted">
        You&apos;re signed in, but your account isn&apos;t part of a household.
        An adult in your household can add you from Settings.
      </p>
    </Card>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link href={href} className="w-fit text-sm text-info hover:underline">
      ← {children}
    </Link>
  );
}
