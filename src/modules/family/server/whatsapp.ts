// "Share to WhatsApp" text. Pure, no I/O. Plain readable text with bullets; no tracking.
import { formatShortDate, type HhMm, type IsoDate } from "./time.ts";

/** wa.me link that opens WhatsApp with the text ready to send to any chat. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** "Shopping list:\n• Milk\n• Eggs". Ticked items are left out. */
export function listShareText(
  name: string,
  items: readonly { text: string; checked: boolean }[],
): string {
  const open = items.filter((item) => !item.checked);
  if (open.length === 0) return `${name}: nothing on the list right now.`;
  const heading = /list$/i.test(name.trim())
    ? name.trim()
    : `${name.trim()} list`;
  return [`${heading}:`, ...open.map((item) => `• ${item.text.trim()}`)].join(
    "\n",
  );
}

export type ShareTask = {
  title: string;
  dueOn: IsoDate | null;
  dueTime?: HhMm | null;
  assigneeName?: string | null;
  notes?: string | null;
  relatedUrl?: string | null;
};

/** "To do: Book NCT\nDue: Sat 24 Oct\nFor: Junaid". */
export function taskShareText(task: ShareTask): string {
  const due = task.dueOn
    ? `Due: ${formatShortDate(task.dueOn)}${task.dueTime ? `, ${task.dueTime.slice(0, 5)}` : ""}`
    : null;
  return [
    `To do: ${task.title.trim()}`,
    due,
    task.assigneeName ? `For: ${task.assigneeName}` : null,
    task.notes?.trim() || null,
    task.relatedUrl ?? null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Several open tasks as a bulleted list. */
export function tasksShareText(tasks: readonly ShareTask[]): string {
  if (tasks.length === 0) return "To do: nothing open right now.";
  return [
    "To do:",
    ...tasks.map((t) => {
      const extras = [
        t.dueOn ? formatShortDate(t.dueOn) : null,
        t.assigneeName ?? null,
      ].filter(Boolean);
      return `• ${t.title.trim()}${extras.length ? ` (${extras.join(", ")})` : ""}`;
    }),
  ].join("\n");
}

export type ShareEvent = {
  title: string;
  date: IsoDate;
  lastDate?: IsoDate | null;
  allDay: boolean;
  time?: HhMm | null;
  endTime?: HhMm | null;
  location?: string | null;
  who?: readonly string[];
  notes?: string | null;
};

/** "Dentist\nThu 22 Oct, 18:15–19:00\nWhere: …\nWho: …". */
export function eventShareText(event: ShareEvent): string {
  let when = formatShortDate(event.date);
  if (event.allDay) {
    when +=
      event.lastDate && event.lastDate !== event.date
        ? ` to ${formatShortDate(event.lastDate)}`
        : " (all day)";
  } else if (event.time) {
    when += `, ${event.time}${event.endTime ? `–${event.endTime}` : ""}`;
  }
  return [
    event.title.trim(),
    when,
    event.location?.trim() ? `Where: ${event.location.trim()}` : null,
    event.who && event.who.length ? `Who: ${event.who.join(", ")}` : null,
    event.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
}
