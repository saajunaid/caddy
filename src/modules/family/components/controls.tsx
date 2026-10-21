"use client";

import { Check, Copy } from "lucide-react";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import type { FormState } from "../actions";
import { cn } from "@/lib/utils";
import { buttonClass } from "./ui";

function useSavedToggle(
  checked: boolean,
  action: (checked: boolean) => Promise<FormState>,
) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const onChange = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        const result = await action(next);
        if (result.error) setError(result.error);
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };
  return { optimistic, error, onChange };
}

const checkboxClass = "size-[18px] shrink-0 accent-[var(--purple)]";

/**
 * A checkbox row that saves immediately (optimistically) through a server action.
 * The whole row is the tap target.
 */
export function CheckToggle({
  checked,
  action,
  children,
  className,
}: {
  checked: boolean;
  action: (checked: boolean) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const { optimistic, error, onChange } = useSavedToggle(checked, action);
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={optimistic}
        onChange={(event) => onChange(event.target.checked)}
        className={checkboxClass}
      />
      <span
        className={cn(
          "min-w-0 flex-1 wrap-anywhere",
          optimistic && "text-muted line-through",
        )}
      >
        {children}
      </span>
      {error ? (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** Just the checkbox (44px tap target), for rows that also contain links. */
export function CheckBox({
  checked,
  action,
  label,
}: {
  checked: boolean;
  action: (checked: boolean) => Promise<FormState>;
  /** Accessible name, e.g. "Book NCT done". */
  label: string;
}) {
  const { optimistic, error, onChange } = useSavedToggle(checked, action);
  return (
    <span className="-my-2 -ml-2.5 flex shrink-0 items-center">
      <label className="grid size-11 cursor-pointer place-items-center">
        <input
          type="checkbox"
          aria-label={label}
          checked={optimistic}
          onChange={(event) => onChange(event.target.checked)}
          className={checkboxClass}
        />
      </label>
      {error ? (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Runs a server action after the user confirms. */
export function ConfirmButton({
  action,
  confirm,
  children,
  className = buttonClass,
  ariaLabel,
}: {
  action: () => Promise<FormState | void>;
  confirm?: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (result && result.error) setError(result.error);
          });
        }}
      >
        {children}
      </button>
      {error ? (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      ) : null}
    </>
  );
}

/** Copies text to the clipboard, with a fallback of selecting it. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-ok" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
