// Converting between UTC instants and the Dublin wall-clock values of <input type="datetime-local">.
// Pure, no I/O.
import { HOUSEHOLD_TIMEZONE } from "../../../server/domain/dates.ts";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: HOUSEHOLD_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-12T09:30" in Dublin time for an instant. */
export function toDublinLocal(instant: Date): string {
  const p = Object.fromEntries(
    parts.formatToParts(instant).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The UTC instant of a Dublin wall-clock time, or null if malformed. */
export function fromDublinLocal(local: string): Date | null {
  const m = LOCAL.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc)) return null;
  // Dublin is UTC+0 or UTC+1; try both offsets and keep the one that round-trips.
  for (const offsetHours of [0, 1]) {
    const candidate = new Date(asUtc - offsetHours * 3_600_000);
    if (toDublinLocal(candidate) === local.trim()) return candidate;
  }
  // A time skipped by the spring clock change: take the moment after the gap.
  return new Date(asUtc);
}
