import { Chip } from "@/components/ui/status";
import {
  applicationBadge,
  MATCH_BADGE,
  statusBadge,
  type ListingSummary,
} from "../display";
import type { MatchLevel } from "../server/types";

export function ListingStatusChip({
  listing,
  today,
}: {
  listing: Pick<ListingSummary, "status" | "closing_date" | "opening_date">;
  today: string;
}) {
  const { label, tone } = statusBadge(listing, today);
  return <Chip tone={tone}>{label}</Chip>;
}

export function ApplicationChip({ status }: { status: string | null }) {
  const { label, tone } = applicationBadge(status);
  return (
    <Chip tone={tone} dot={false}>
      {label}
    </Chip>
  );
}

export function MatchChip({ level }: { level: MatchLevel }) {
  if (level === "none") return <span className="text-sm text-muted">No</span>;
  const { label, tone } = MATCH_BADGE[level];
  return <Chip tone={tone}>{label}</Chip>;
}

export function NewChip() {
  return (
    <Chip tone="ok" dot={false}>
      New
    </Chip>
  );
}
