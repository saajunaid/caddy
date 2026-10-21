import Link from "next/link";
import { cn } from "@/lib/utils";
import { FILTERS, type FilterId } from "../display";

/** Filter chips (search params, so links are shareable and work without JS). County, status and
 * application filters, search and sorting live in the listings table below. */
export function FilterBar({
  filter,
  counts,
}: {
  filter: FilterId;
  counts: Record<FilterId, number>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Filter listings"
        className="-mb-0.5 flex min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5"
      >
        {FILTERS.map((f) => {
          const params = new URLSearchParams(
            f.id === "matches" ? {} : { filter: f.id },
          );
          const query = params.toString();
          const active = f.id === filter;
          return (
            <Link
              key={f.id}
              href={query ? `/housing?${query}` : "/housing"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-none rounded-full border px-3 py-1.5 text-sm font-medium",
                active
                  ? "border-fg bg-fg text-bg"
                  : "border-line text-fg hover:border-muted",
              )}
            >
              {f.label}
              <span className="num ml-1 text-xs opacity-70">
                {counts[f.id]}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
