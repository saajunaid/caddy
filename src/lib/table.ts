// Sorting and filtering for data tables. Pure; unit-tested.

export type SortValue = string | number | null;
export type SortDir = "asc" | "desc";

export type TableRowData = {
  key: string;
  /** Value used to sort each column. null (unknown) always sorts last. */
  sort: Record<string, SortValue>;
  /** Label used by a column's dropdown filter, e.g. "Co. Limerick". */
  filter?: Record<string, string | null>;
  /** Text matched by the search box (lower-cased by the caller or here). */
  search?: string;
};

export type TableState = {
  sort: string | null;
  dir: SortDir;
  q: string;
  filters: Record<string, string>;
};

const collator = new Intl.Collator("en-IE", {
  numeric: true,
  sensitivity: "base",
});

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable sort; unknown values stay at the bottom in both directions. */
export function sortRows<R extends TableRowData>(
  rows: readonly R[],
  column: string | null,
  dir: SortDir,
): R[] {
  if (!column) return [...rows];
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row.sort[column] ?? null;
      const b = y.row.sort[column] ?? null;
      if (a === null && b === null) return x.index - y.index;
      if (a === null) return 1;
      if (b === null) return -1;
      return sign * compare(a, b) || x.index - y.index;
    })
    .map(({ row }) => row);
}

/** Keeps rows that match every dropdown filter and contain every search word. */
export function filterRows<R extends TableRowData>(
  rows: readonly R[],
  q: string,
  filters: Readonly<Record<string, string>>,
): R[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const active = Object.entries(filters).filter(([, v]) => v !== "");
  return rows.filter((row) => {
    for (const [column, value] of active) {
      if ((row.filter?.[column] ?? "") !== value) return false;
    }
    if (words.length === 0) return true;
    const haystack = (row.search ?? "").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Distinct, sorted filter options for a column (blank values left out). */
export function filterOptions(
  rows: readonly TableRowData[],
  column: string,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row.filter?.[column];
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => collator.compare(a, b));
}

/** Reads table state from URL params, namespaced by prefix so a page can hold several tables. */
export function readTableState(
  params: URLSearchParams,
  prefix: string,
  columns: readonly string[],
  filterColumns: readonly string[],
): TableState {
  const p = (name: string) => params.get(prefix ? `${prefix}.${name}` : name);
  const sort = p("sort");
  const dir = p("dir");
  const filters: Record<string, string> = {};
  for (const column of filterColumns) {
    const value = p(`f.${column}`);
    if (value) filters[column] = value;
  }
  return {
    sort: sort && columns.includes(sort) ? sort : null,
    dir: dir === "desc" ? "desc" : "asc",
    q: p("q") ?? "",
    filters,
  };
}

/** Writes table state into a copy of the URL params; defaults are removed to keep links short. */
export function writeTableState(
  params: URLSearchParams,
  prefix: string,
  state: TableState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const name = (n: string) => (prefix ? `${prefix}.${n}` : n);
  for (const key of [...next.keys()]) {
    if (key.startsWith(name("f."))) next.delete(key);
  }
  const set = (key: string, value: string | null) => {
    if (value) next.set(name(key), value);
    else next.delete(name(key));
  };
  set("sort", state.sort);
  set("dir", state.sort && state.dir === "desc" ? "desc" : null);
  set("q", state.q.trim() || null);
  for (const [column, value] of Object.entries(state.filters)) {
    set(`f.${column}`, value || null);
  }
  return next;
}
