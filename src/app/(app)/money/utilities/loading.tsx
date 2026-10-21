import { Card } from "@/components/ui/card";

/** Placeholder while contracts and offers load. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-[22px]">
      <span className="sr-only">Loading utilities…</span>
      <Card className="flex items-center gap-4 p-4" aria-hidden="true">
        <div className="size-16 shrink-0 animate-pulse rounded-xl bg-sunk" />
        <div className="grid flex-1 gap-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-sunk" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-sunk" />
        </div>
      </Card>
      <Card className="grid gap-3 p-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-sunk" />
        ))}
      </Card>
    </div>
  );
}
