// Clash detection for the family week. Pure, no I/O; runs in plain Node too.
import { dublinTime } from "./time.ts";

/** Events without an end time are assumed to last this long when checking for clashes. */
export const ASSUMED_DURATION_MINUTES = 60;

export type ClashCandidate = {
  key: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  /** Who's involved. Empty means "not set", which is treated as everyone. */
  memberIds: readonly string[];
};

export type Clash = {
  a: string;
  b: string;
  /** Members both events involve; empty when either event has no members set. */
  sharedMemberIds: string[];
};

function endOf(item: ClashCandidate): number {
  return item.end && item.end > item.start
    ? item.end.getTime()
    : item.start.getTime() + ASSUMED_DURATION_MINUTES * 60_000;
}

function sharedMembers(a: ClashCandidate, b: ClashCandidate): string[] | null {
  if (a.memberIds.length === 0 || b.memberIds.length === 0) return [];
  const shared = a.memberIds.filter((id) => b.memberIds.includes(id));
  return shared.length > 0 ? shared : null;
}

/**
 * Timed events that overlap for the same person, as pairs (a starts first).
 * All-day events never clash. An event with nobody set counts as involving everyone.
 */
export function findClashes(items: readonly ClashCandidate[]): Clash[] {
  const timed = items
    .filter((item) => !item.allDay)
    .sort((x, y) => x.start.getTime() - y.start.getTime());
  const clashes: Clash[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    const a = timed[i];
    const aEnd = endOf(a);
    for (let j = i + 1; j < timed.length; j += 1) {
      const b = timed[j];
      if (b.start.getTime() >= aEnd) break;
      const shared = sharedMembers(a, b);
      if (shared) clashes.push({ a: a.key, b: b.key, sharedMemberIds: shared });
    }
  }
  return clashes;
}

/** Short warnings per event key, e.g. "Clashes with Dentist 18:15". */
export function clashWarnings(
  items: readonly ClashCandidate[],
  clashes: readonly Clash[] = findClashes(items),
): Map<string, string[]> {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const warnings = new Map<string, string[]>();
  const add = (key: string, other: ClashCandidate) => {
    const list = warnings.get(key) ?? [];
    list.push(`Clashes with ${other.title} ${dublinTime(other.start)}`);
    warnings.set(key, list);
  };
  for (const clash of clashes) {
    const a = byKey.get(clash.a);
    const b = byKey.get(clash.b);
    if (!a || !b) continue;
    add(a.key, b);
    add(b.key, a);
  }
  return warnings;
}
