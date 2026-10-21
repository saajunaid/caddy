import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg placeholder:text-muted/80";

export const buttonClass =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted disabled:opacity-60";

export const primaryButtonClass =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-60";

export function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  hint,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { id: string; hint?: boolean }) {
  return (
    <input
      id={id}
      aria-describedby={hint ? `${id}-hint` : undefined}
      className={cn(inputClass, className)}
      {...props}
    />
  );
}

export function FormMessage({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-bad">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="text-sm text-ok">
        {notice}
      </p>
    );
  }
  return null;
}
