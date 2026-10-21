export default function TravelLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-[22px]">
      <span className="sr-only">Loading trips…</span>
      <div className="h-9 w-48 animate-pulse rounded-lg bg-sunk" />
      <div className="h-4 w-full max-w-md animate-pulse rounded bg-sunk" />
      <div className="grid gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-[10px] border border-line bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
