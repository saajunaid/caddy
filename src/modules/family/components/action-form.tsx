"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { FormState } from "../actions";
import { cn } from "@/lib/utils";
import { primaryButtonClass } from "./ui";

/**
 * A form that calls a server action and shows its error or notice. Fields keep their values
 * when the action reports an error; `resetOnSuccess` clears them after a successful save.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  submitClassName = primaryButtonClass,
  className,
  footer,
  resetOnSuccess = false,
  ariaLabel,
  inline = false,
}: {
  action: (formData: FormData) => Promise<FormState | void>;
  children: ReactNode;
  submitLabel: ReactNode;
  pendingLabel?: string;
  submitClassName?: string;
  className?: string;
  /** Extra controls next to the submit button. */
  footer?: ReactNode;
  resetOnSuccess?: boolean;
  ariaLabel?: string;
  /** Fields and the button on one row (quick-add boxes). */
  inline?: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const submit = (
    <button type="submit" disabled={pending} className={submitClassName}>
      {pending ? pendingLabel : submitLabel}
    </button>
  );

  return (
    <form
      aria-label={ariaLabel}
      className={cn("grid gap-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          try {
            const result = (await action(data)) ?? {};
            setState(result);
            if (result.ok && resetOnSuccess) {
              form.reset();
              form.querySelector<HTMLInputElement>("input")?.focus();
            }
          } catch (error) {
            // Redirects are thrown by the framework and handled by it; rethrow those.
            if (
              error instanceof Error &&
              "digest" in error &&
              String((error as { digest?: unknown }).digest).startsWith(
                "NEXT_REDIRECT",
              )
            ) {
              throw error;
            }
            setState({
              error: navigator.onLine
                ? "Something went wrong. Try again."
                : "You're offline. Try again when you're back online.",
            });
          }
        });
      }}
    >
      {inline ? (
        <div className="flex items-start gap-2 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-1">
          {children}
          {submit}
        </div>
      ) : (
        children
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="text-sm text-ok">
          {state.notice}
        </p>
      ) : null}
      {inline ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {submit}
          {footer}
        </div>
      )}
    </form>
  );
}
