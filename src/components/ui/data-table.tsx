"use client";

// A table with sortable column headers, a search box and dropdown filters. Rows are rendered on the
// server (cells are React nodes); this component only reorders and hides them, so it works with
// any data and stays fast for the few hundred rows Caddy shows. State lives in the URL, namespaced
// by `prefix`, so a page can hold several tables and back/forward keeps the view.
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  filterOptions,
  filterRows,
  readTableState,
  sortRows,
  writeTableState,
  type SortDir,
  type TableRowData,
  type TableState,
} from "@/lib/table";

export type DataColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Default true. */
  sortable?: boolean;
  /** Show a dropdown filter built from each row's `filter[key]`. */
  filter?: boolean;
  /** Label for the dropdown, e.g. "All counties". */
  filterAll?: string;
  /** First click sorts this way (e.g. newest first for dates). */
  firstDir?: SortDir;
  headerClassName?: string;
};

export type DataRow = TableRowData & {
  cells: Record<string, ReactNode>;
  /** Phone layout for this row; when every row has one, phones see cards instead of the table. */
  card?: ReactNode;
  rowClassName?: string;
};

const th =
  "border-b border-line px-3 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.06em] whitespace-nowrap text-muted uppercase";
const td = "border-b border-line px-3 py-[11px] align-middle";
const control =
  "min-h-10 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg";

export function DataTable({
  columns,
  rows,
  prefix = "",
  label,
  searchable = true,
  searchPlaceholder = "Search",
  empty,
  minWidth,
  defaultSort,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  /** Namespace for URL params when a page has more than one table. */
  prefix?: string;
  /** Accessible name of the table, e.g. "Cost Rental listings". */
  label: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Shown when no row exists at all (filters cleared). */
  empty?: ReactNode;
  /** Minimum table width before it scrolls sideways, e.g. "720px". */
  minWidth?: string;
  /** Order to use when the URL doesn't set one (rows otherwise keep the server's order). */
  defaultSort?: { column: string; dir: SortDir };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const sortable = columns.filter((c) => c.sortable !== false);
  const filterable = columns.filter((c) => c.filter);
  const paramString = params.toString();
  const urlState = readTableState(
    new URLSearchParams(paramString),
    prefix,
    sortable.map((c) => c.key),
    filterable.map((c) => c.key),
  );
  // Typing updates instantly; the URL follows without blocking input.
  const [q, setQ] = useState(urlState.q);
  const state: TableState = { ...urlState, q };
  const sortColumn = state.sort ?? defaultSort?.column ?? null;
  const sortDir = state.sort ? state.dir : (defaultSort?.dir ?? "asc");

  const options = useMemo(
    () =>
      Object.fromEntries(
        filterable.map((c) => [c.key, filterOptions(rows, c.key)]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- columns are static per page
    [rows],
  );
  const shown = useMemo(
    () => sortRows(filterRows(rows, q, state.filters), sortColumn, sortDir),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters come from the URL string
    [rows, q, paramString, sortColumn, sortDir],
  );

  const update = (next: Partial<TableState>) => {
    const written = writeTableState(
      new URLSearchParams(params.toString()),
      prefix,
      { ...state, ...next },
    );
    const query = written.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      }),
    );
  };

  const clickSort = (column: DataColumn) => {
    if (sortColumn === column.key) {
      update({ sort: column.key, dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      update({ sort: column.key, dir: column.firstDir ?? "asc" });
    }
  };

  const anyActive =
    q.trim() !== "" || Object.values(state.filters).some(Boolean);
  const cards = rows.length > 0 && rows.every((r) => r.card !== undefined);

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="grid gap-3">
      <div
        role="search"
        aria-label={`Filter ${label}`}
        className="flex flex-wrap items-center gap-2"
      >
        {searchable ? (
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Search {label}</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={q}
              placeholder={searchPlaceholder}
              onChange={(e) => {
                setQ(e.target.value);
                update({ q: e.target.value });
              }}
              className={cn(control, "w-full pl-9")}
            />
          </label>
        ) : null}
        {filterable.map((c) =>
          options[c.key].length > 1 || state.filters[c.key] ? (
            <label key={c.key} className="min-w-0">
              <span className="sr-only">{c.label}</span>
              <select
                value={state.filters[c.key] ?? ""}
                onChange={(e) =>
                  update({
                    filters: { ...state.filters, [c.key]: e.target.value },
                  })
                }
                className={control}
              >
                <option value="">{c.filterAll ?? `All: ${c.label}`}</option>
                {options[c.key].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ) : null,
        )}
        {sortable.length > 0 ? (
          <div className="flex items-center gap-1 lg:hidden">
            <label>
              <span className="sr-only">Sort by</span>
              <select
                value={sortColumn ?? ""}
                onChange={(e) => {
                  const column = sortable.find((c) => c.key === e.target.value);
                  update(
                    column
                      ? { sort: column.key, dir: column.firstDir ?? "asc" }
                      : { sort: null },
                  );
                }}
                className={control}
              >
                <option value="">Sort: default</option>
                {sortable.map((c) => (
                  <option key={c.key} value={c.key}>
                    Sort: {c.label}
                  </option>
                ))}
              </select>
            </label>
            {sortColumn ? (
              <button
                type="button"
                onClick={() =>
                  update({
                    sort: sortColumn,
                    dir: sortDir === "asc" ? "desc" : "asc",
                  })
                }
                className={cn(control, "inline-flex items-center px-2.5")}
                aria-label={
                  sortDir === "asc" ? "Sorted ascending" : "Sorted descending"
                }
                title="Reverse order"
              >
                {sortDir === "asc" ? (
                  <ArrowUp aria-hidden="true" className="size-4" />
                ) : (
                  <ArrowDown aria-hidden="true" className="size-4" />
                )}
              </button>
            ) : null}
          </div>
        ) : null}
        {anyActive ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              update({ q: "", filters: {} });
            }}
            className={cn(control, "inline-flex items-center gap-1")}
          >
            <X aria-hidden="true" className="size-4" />
            Clear
          </button>
        ) : null}
        <span className="num text-sm text-muted" aria-live="polite">
          {shown.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}`
            : `${shown.length} of ${rows.length}`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface px-4 py-6 text-center text-muted">
          {rows.length === 0
            ? "Nothing here yet."
            : "Nothing matches. Try another search or clear the filters."}
        </p>
      ) : (
        <>
          {cards ? (
            <div className="grid gap-3 lg:hidden">
              {shown.map((r) => (
                <div key={r.key}>{r.card}</div>
              ))}
            </div>
          ) : null}
          <div
            className={cn(
              "overflow-x-auto rounded-[10px] border border-line bg-surface",
              cards && "hidden lg:block",
            )}
          >
            <table
              aria-label={label}
              className="w-full border-collapse text-[0.88rem]"
              style={minWidth ? { minWidth } : undefined}
            >
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = sortColumn === c.key;
                    const right = c.align === "right";
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        className={cn(
                          th,
                          right && "text-right",
                          c.headerClassName,
                        )}
                        aria-sort={
                          active
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        {c.sortable === false ? (
                          c.label
                        ) : (
                          <button
                            type="button"
                            onClick={() => clickSort(c)}
                            className={cn(
                              "inline-flex items-center gap-1 uppercase hover:text-fg",
                              active && "text-fg",
                            )}
                          >
                            {c.label}
                            {active ? (
                              sortDir === "asc" ? (
                                <ArrowUp
                                  aria-hidden="true"
                                  className="size-3"
                                />
                              ) : (
                                <ArrowDown
                                  aria-hidden="true"
                                  className="size-3"
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                aria-hidden="true"
                                className="size-3 opacity-40"
                              />
                            )}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.key}
                    className={cn(
                      "hover:bg-fg/4 [&:last-child>td]:border-b-0",
                      r.rowClassName,
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(td, c.align === "right" && "text-right")}
                      >
                        {r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
