import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-[22px]">
      {[0, 1].map((block) => (
        <Card key={block} className="grid gap-3 p-4">
          <span className="h-4 w-40 animate-pulse rounded bg-sunk" />
          <span className="h-3 w-full animate-pulse rounded bg-sunk" />
          <span className="h-3 w-3/4 animate-pulse rounded bg-sunk" />
        </Card>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
