"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Housing couldn't load (database or network). Never shown as "no listings". */
export default function HousingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Housing couldn't load"
      footer={
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted"
        >
          Try again
        </button>
      }
    >
      <p>
        This is a loading problem, not an empty list. If you&apos;re offline,
        your listings will come back when you reconnect.
      </p>
      {error.digest ? (
        <p className="num mt-1 text-xs">Reference {error.digest}</p>
      ) : null}
    </EmptyState>
  );
}
