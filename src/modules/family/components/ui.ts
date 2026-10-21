// Shared class names for Family forms and buttons (matches Settings and the prototype).

export const inputClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-fg placeholder:text-muted";

export const textareaClass = `${inputClass} min-h-[72px] resize-y`;

export const labelClass = "text-sm font-semibold";

export const buttonClass =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold text-fg hover:border-muted disabled:opacity-60";

export const primaryButtonClass =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-105 disabled:opacity-60";

export const dangerButtonClass =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-bad/50 bg-surface px-3.5 text-sm font-semibold text-bad hover:border-bad disabled:opacity-60";

export const linkClass = "text-sm text-info hover:underline";

export const cardTitleClass = "text-[1.05rem] font-semibold";
