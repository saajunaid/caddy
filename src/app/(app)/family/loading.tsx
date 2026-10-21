/** Skeleton while the week and cards load. */
export default function FamilyLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-[22px]">
      <div className="grid gap-2">
        <div className="h-3 w-28 animate-pulse rounded bg-sunk" />
        <div className="h-7 w-40 animate-pulse rounded bg-sunk" />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-7 lg:gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-[10px] border border-line bg-surface lg:h-[220px]"
          />
        ))}
      </div>
      <div className="grid gap-[22px] lg:grid-cols-[1.35fr_1fr]">
        <div className="h-48 animate-pulse rounded-[10px] border border-line bg-surface" />
        <div className="h-48 animate-pulse rounded-[10px] border border-line bg-surface" />
      </div>
    </div>
  );
}
