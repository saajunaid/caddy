"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function MoneyError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="This page didn't load"
      footer={
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted"
        >
          Try again
        </button>
      }
    >
      Caddy couldn&apos;t load your money details just now. Your documents are
      safe. If you&apos;re offline, try again once you&apos;re connected.
    </EmptyState>
  );
}
