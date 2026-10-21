"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";

export default function FamilyError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error.digest ?? "family page error");
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <Card className="grid justify-items-start gap-3 p-5">
      <h1 className="text-[1.05rem] font-semibold text-bad">
        {offline ? "You're offline" : "Couldn't load Family"}
      </h1>
      <p className="text-muted">
        {offline
          ? "Your week, tasks and lists need a connection. Nothing you saved is lost."
          : "Something went wrong loading this page. Nothing you saved is lost."}
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
