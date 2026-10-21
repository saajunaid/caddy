import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { MONTH_SHORT } from "../../documents/review";
import { WFH_CATEGORY_SHORT } from "../categories";
import type { ChecklistLine, MemberSummary } from "../domain/summary";

/** Which months have electricity, heating and broadband evidence, and whose WFH days are missing. */
export function EvidenceChecklist({
  checklist,
  members,
}: {
  checklist: ChecklistLine[];
  members: MemberSummary[];
}) {
  return (
    <Card className="grid gap-3 p-4">
      <h3 className="text-[1.05rem] font-semibold">Evidence checklist</h3>
      <div className="grid gap-3">
        {checklist.map((line) => {
          const name =
            WFH_CATEGORY_SHORT[
              line.category as keyof typeof WFH_CATEGORY_SHORT
            ] ?? line.category;
          const done = line.expected.length > 0 && line.missing.length === 0;
          return (
            <div key={line.category} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{name} bills</span>
                {line.expected.length === 0 ? (
                  <span className="text-sm text-muted">Year not started</span>
                ) : done ? (
                  <Chip tone="ok">Done</Chip>
                ) : (
                  <Chip tone="due">
                    Missing {line.missing.length} month
                    {line.missing.length === 1 ? "" : "s"}
                  </Chip>
                )}
              </div>
              <ol
                className="grid grid-cols-12 gap-1"
                aria-label={`${name} evidence by month`}
              >
                {MONTH_SHORT.map((month, index) => {
                  const m = index + 1;
                  const covered = line.covered.includes(m);
                  const expected = line.expected.includes(m);
                  const state = covered
                    ? "has evidence"
                    : expected
                      ? "missing"
                      : "not yet due";
                  return (
                    <li
                      key={month}
                      title={`${month}: ${state}`}
                      className={cn(
                        "grid h-7 place-items-center rounded text-[0.62rem] font-semibold sm:text-[0.7rem]",
                        covered
                          ? "bg-ok/20 text-fg"
                          : expected
                            ? "border border-due/60 text-due"
                            : "bg-sunk text-muted",
                      )}
                    >
                      <span aria-hidden="true">{month.slice(0, 1)}</span>
                      <span className="sr-only">
                        {month}: {state}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        {members.map((m) => {
          const entered = 12 - (m.breakdown?.monthsMissing.length ?? 12);
          return (
            <div
              key={m.member.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-medium">WFH days for {m.member.name}</span>
              {entered === 12 ? (
                <Chip tone="ok">Entered</Chip>
              ) : entered === 0 ? (
                <Chip tone="review">Not entered</Chip>
              ) : (
                <Chip tone="review">{entered} of 12 months</Chip>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        A month counts when a linked bill covers at least a week of it.
      </p>
    </Card>
  );
}
