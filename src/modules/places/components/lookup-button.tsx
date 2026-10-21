"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useActionState } from "react";
import { lookupNearbyAction, type LookupState } from "../actions";
import type { Anchor } from "../server/geo";

/** Runs a lookup for one location now, with a spinner and plain-language errors. */
export function LookupButton({
  anchor,
  label = "Look up nearby places now",
  primary = true,
}: {
  anchor: Anchor;
  label?: string;
  primary?: boolean;
}) {
  const [state, action, pending] = useActionState<LookupState, FormData>(
    async () => {
      try {
        return await lookupNearbyAction(anchor);
      } catch {
        return {
          status: "failed",
          message:
            typeof navigator !== "undefined" && !navigator.onLine
              ? "You're offline. Try again when you're connected."
              : "Something went wrong. Try again in a minute.",
        };
      }
    },
    { status: "idle" },
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className={
          primary
            ? "inline-flex min-h-10 items-center gap-2 rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-70"
            : "inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-sm font-semibold hover:border-muted disabled:opacity-70"
        }
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Search aria-hidden="true" className="size-4" />
        )}
        {pending ? "Looking up…" : label}
      </button>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          Looking up nearby places. This can take up to a minute.
        </p>
      ) : null}
      {!pending && state.status === "failed" ? (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      ) : null}
      {!pending && state.status === "done" && state.message ? (
        <p role="status" className="text-sm text-due">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
