"use client";

import { Card } from "@/components/ui/card";

/** Shown when contracts or offers can't load. Never shown as "no contracts". */
export default function UtilitiesError({
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <Card
      className="grid justify-items-start gap-3 border-bad/50 p-5"
      role="alert"
    >
      <h2 className="text-[1.05rem] font-semibold">
        Couldn&apos;t load your utilities
      </h2>
      <p className="text-muted">
        Your contracts and offers are safe; Caddy just couldn&apos;t reach them
        right now. If you&apos;re offline, reconnect and try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted"
      >
        Try again
      </button>
    </Card>
  );
}
