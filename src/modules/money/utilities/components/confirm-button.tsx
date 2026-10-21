"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/** Submit button that asks before a destructive action. Use inside a <form action={…}>. */
export function ConfirmButton({
  message,
  children,
  className,
  label,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  /** Accessible name when the visible content is only an icon. */
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-[9px] px-2.5 text-sm font-semibold text-muted hover:text-bad disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}
