"use client";

import { useEffect } from "react";
import { markAllReadAction } from "./actions";

/** Marks everything read a moment after the inbox is opened, so the badge clears. */
export function MarkReadOnView({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    const timer = window.setTimeout(() => {
      void markAllReadAction();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [hasUnread]);
  return null;
}
