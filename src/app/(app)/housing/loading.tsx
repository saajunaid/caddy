import { PageHeader } from "@/components/ui/page-header";

/** Shown while Housing data loads. Shapes only; no fake numbers. */
export default function Loading() {
  return (
    <>
      <PageHeader eyebrow="Cost Rental Watch" title="Housing" />
      <div role="status" aria-live="polite" className="grid gap-3">
        <span className="sr-only">Loading listings…</span>
        <div className="h-5 w-64 max-w-full animate-pulse rounded bg-sunk" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-[10px] border border-line bg-surface"
          />
        ))}
      </div>
    </>
  );
}
