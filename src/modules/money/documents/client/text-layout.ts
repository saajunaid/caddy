// Rebuilds reading-order lines from positioned PDF text fragments. Pure.

export type PositionedText = {
  str: string;
  /** Left edge, PDF units. */
  x: number;
  /** Baseline, PDF units (origin bottom-left, so larger = higher on the page). */
  y: number;
  height: number;
};

/**
 * Groups fragments whose baselines are within half a line of each other into one line, orders
 * lines top to bottom and fragments left to right. Bill parsers read "label … value" per line.
 */
export function itemsToLines(items: readonly PositionedText[]): string[] {
  const rows: {
    y: number;
    height: number;
    parts: { x: number; str: string }[];
  }[] = [];
  for (const item of items) {
    const str = item.str.replace(/\s+/g, " ");
    if (!str.trim()) continue;
    const height = item.height > 0 ? item.height : 10;
    const row = rows.find(
      (r) =>
        Math.abs(r.y - item.y) <= Math.max(2, Math.min(height, r.height) * 0.5),
    );
    if (row) row.parts.push({ x: item.x, str });
    else rows.push({ y: item.y, height, parts: [{ x: item.x, str }] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str.trim())
        .join(" ")
        .replace(/ {2,}/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

/** Whether a PDF's text layer is too thin to be the real content (a scan or photo). */
export function looksScanned(text: string, pages: number): boolean {
  const letters = (text.match(/[A-Za-z0-9]/g) ?? []).length;
  return letters < Math.max(40, pages * 25);
}
