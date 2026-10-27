// The morning summary push: one short notification per household per day. Pure; unit-tested.
import { sortItems, type TodayItem } from "./needs-you.ts";

export type DigestInput = {
  items: readonly TodayItem[];
  /** Friendly names of today's background checks whose latest run failed or partly failed. */
  failedChecks: readonly string[];
  /** Today's Cost Rental check summary, e.g. "204 listings checked · 0 match · 0 new". */
  housingSummary: string | null;
};

export type Digest = {
  title: string;
  body: string;
  severity: "info" | "warning";
};

const MAX_BODY = 230;

/** Always produces a message, so a quiet day still shows that Caddy checked everything. */
export function buildDigest(input: DigestInput): Digest {
  const items = sortItems(input.items);
  const parts: string[] = [];

  if (input.failedChecks.length > 0) {
    parts.push(
      `${input.failedChecks.length === 1 ? "Check failed" : "Checks failed"}: ${input.failedChecks.join(", ")}`,
    );
  }
  for (const item of items.slice(0, 3)) {
    parts.push(`${item.label}: ${item.title}`);
  }
  if (items.length > 3) parts.push(`+${items.length - 3} more`);
  if (input.housingSummary) parts.push(`Cost Rental: ${input.housingSummary}`);

  const count = items.length;
  const title =
    count > 0
      ? `${count} ${count === 1 ? "thing needs" : "things need"} you today`
      : input.failedChecks.length > 0
        ? "Nothing new, but a check failed"
        : "All quiet today";

  let body = parts.join(" · ") || "All checks ran. Nothing needs you.";
  if (body.length > MAX_BODY)
    body = `${body.slice(0, MAX_BODY - 1).trimEnd()}…`;

  return {
    title,
    body,
    severity: input.failedChecks.length > 0 ? "warning" : "info",
  };
}
