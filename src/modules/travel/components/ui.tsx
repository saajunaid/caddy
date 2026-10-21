import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg placeholder:text-muted";
export const textareaClass = cn(inputClass, "min-h-[72px] py-2");
export const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold text-fg hover:border-muted disabled:opacity-60";
export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-60";
export const smallButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-fg hover:border-muted disabled:opacity-60";
export const linkClass = "text-info underline-offset-2 hover:underline";

export function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
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

export function FormErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm"
    >
      <p className="font-semibold text-bad">Please fix:</p>
      <ul className="list-disc pl-5">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export function Fieldset({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid min-w-0 gap-4 rounded-[10px] border border-line bg-surface p-4">
      <legend className="px-1 text-[1.05rem] font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** A note in the prototype's quiet style. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-r-lg border-l-[3px] border-line bg-sunk px-3 py-2.5 text-[0.82rem] text-muted">
      {children}
    </p>
  );
}
