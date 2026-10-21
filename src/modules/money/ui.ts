// Class names shared by the Money screens (matching the prototype's .btn, .input and .note styles).

export const btn =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold text-fg hover:border-muted disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4";

export const btnPrimary =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4";

export const btnSmall =
  "inline-flex min-h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 text-sm font-semibold text-fg hover:border-muted disabled:opacity-60";

export const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg aria-[invalid=true]:border-bad";

export const note =
  "rounded-r-lg border-l-[3px] border-line bg-sunk px-3 py-2.5 text-[0.82rem] text-muted";

export const link =
  "font-semibold text-info underline-offset-2 hover:underline";

export const sectionTitle = "text-[1.05rem] font-semibold";
