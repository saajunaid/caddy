"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/modules/travel/components/ui";

export default function TravelError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load your trips"
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => retry()} className={buttonClass}>
            Try again
          </button>
          <Link href="/travel" className={buttonClass}>
            All trips
          </Link>
        </div>
      }
    >
      <p>
        Caddy couldn&apos;t reach the database. Nothing you saved has been lost.
        If you&apos;re offline, try again once you&apos;re connected.
      </p>
      {error.digest ? (
        <p className="num mt-2 text-xs">Reference: {error.digest}</p>
      ) : null}
    </EmptyState>
  );
}
