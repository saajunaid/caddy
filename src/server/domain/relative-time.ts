import { daysBetween, dublinDate } from "./dates.ts";

const time = new Intl.DateTimeFormat("en-IE", {
  timeZone: "Europe/Dublin",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayMonth = new Intl.DateTimeFormat("en-IE", {
  timeZone: "Europe/Dublin",
  day: "numeric",
  month: "short",
});

/** Compact Dublin-time label: "07:14", "Yesterday", "Mon", "12 Oct". Pure. */
export function formatWhen(instant: Date, now: Date): string {
  const days = daysBetween(dublinDate(instant), dublinDate(now));
  if (days <= 0) return time.format(instant);
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin",
      weekday: "short",
    }).format(instant);
  }
  return dayMonth.format(instant);
}

/** "Checked today 07:14", "Checked yesterday 07:14", "Checked 12 Oct". */
export function formatChecked(instant: Date, now: Date): string {
  const days = daysBetween(dublinDate(instant), dublinDate(now));
  if (days <= 0) return `today ${time.format(instant)}`;
  if (days === 1) return `yesterday ${time.format(instant)}`;
  return dayMonth.format(instant);
}
