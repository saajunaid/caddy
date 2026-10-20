import type { CSSProperties, ReactNode } from "react";

/** Meaning colours. Keep these semantic; never pick a colour for decoration. */
export const TONES = {
  ok: "var(--green)", // new, open, succeeded
  due: "var(--orange)", // closing soon, due
  bad: "var(--red)", // failed, overdue, closed
  review: "var(--yellow)", // needs review, estimate
  info: "var(--cyan)", // info, running
  primary: "var(--purple)",
  mine: "var(--pink)", // the user's own picks
  neutral: "var(--muted)",
} as const;

export type Tone = keyof typeof TONES;

export function Chip({
  tone = "neutral",
  dot = true,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className="chip"
      data-dot={dot ? "" : undefined}
      style={{ "--c": TONES[tone] } as CSSProperties}
    >
      {children}
    </span>
  );
}

/** Where a fact came from. Matches the provenance values stored with each fact. */
export type Provenance =
  | "official"
  | "provider"
  | "osm"
  | "google"
  | "estimate"
  | "user"
  | "ocr-proposed";

const PROVENANCE: Record<Provenance, { label: string; tone: Tone }> = {
  official: { label: "Official", tone: "info" },
  provider: { label: "Provider", tone: "info" },
  osm: { label: "OSM", tone: "neutral" },
  google: { label: "Google", tone: "neutral" },
  estimate: { label: "Estimate", tone: "review" },
  user: { label: "You", tone: "mine" },
  "ocr-proposed": { label: "Proposed", tone: "review" },
};

export function ProvenanceTag({ source }: { source: Provenance }) {
  const { label, tone } = PROVENANCE[source];
  return (
    <span className="tag" style={{ "--c": TONES[tone] } as CSSProperties}>
      {label}
    </span>
  );
}
