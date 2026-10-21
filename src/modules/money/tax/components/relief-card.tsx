import { Card } from "@/components/ui/card";
import { ProvenanceTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/server/domain/money";
import { formatDate, MONTH_SHORT } from "../../documents/review";
import { note } from "../../ui";
import { WFH_CATEGORY_SHORT, WFH_CATEGORIES } from "../categories";
import type { ActiveRule, MemberSummary } from "../domain/summary";
import { HIGHER_RATE_PERCENT, STANDARD_RATE_PERCENT } from "../domain/wfh";

function Line({
  label,
  op,
  value,
  total,
  muted,
}: {
  label: React.ReactNode;
  op?: string;
  value: React.ReactNode;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] gap-3 border-t border-line px-4 py-2.5 first:border-t-0",
        total && "bg-ok/10 font-bold",
      )}
    >
      <span className={cn(muted && "text-muted")}>
        {label}
        {op ? (
          <span className="num ml-1.5 text-[0.82rem] font-normal text-muted">
            {op}
          </span>
        ) : null}
      </span>
      <span className="num text-right">{value}</span>
    </div>
  );
}

export function RuleLine({ rule }: { rule: ActiveRule }) {
  const r = rule.record;
  return (
    <span className="text-sm text-muted">
      Rule {r.ruleCode} v{r.version} ({r.taxYearFrom}
      {r.taxYearTo ? `–${r.taxYearTo}` : " onwards"}) ·{" "}
      <a
        href={r.officialSourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-info hover:underline"
      >
        Revenue guidance
      </a>{" "}
      · reviewed {formatDate(r.reviewedOn)}
    </span>
  );
}

/** Step-by-step remote working relief for one person: A, B ÷ C, share, − D, × 30%. */
export function ReliefCard({
  summary,
  rule,
}: {
  summary: MemberSummary;
  rule: ActiveRule;
}) {
  const b = summary.breakdown;
  if (!b) return null;
  const shared = summary.evidence.some(
    (e) =>
      e.sharePercent < 100 &&
      (WFH_CATEGORIES as readonly string[]).includes(e.category),
  );
  const missing = b.monthsMissing.map((m) => MONTH_SHORT[m - 1]);

  return (
    <Card>
      <div className="grid gap-1 px-4 pt-4 pb-3">
        <h3 className="text-[1.05rem] font-semibold">
          Remote working relief · {summary.member.name}
        </h3>
        <RuleLine rule={rule} />
      </div>
      <div className="text-[0.9rem]">
        {b.categories.map((c) => (
          <Line
            key={c.category}
            label={
              <>
                {WFH_CATEGORY_SHORT[
                  c.category as keyof typeof WFH_CATEGORY_SHORT
                ] ?? c.category}{" "}
                <span className="text-muted">
                  ({c.count} bill{c.count === 1 ? "" : "s"}
                  {c.paidCents !== c.allowableCents
                    ? `, your share of ${formatMoney(c.paidCents)}`
                    : ""}
                  )
                </span>
              </>
            }
            value={formatMoney(c.allowableCents)}
            muted={c.count === 0}
          />
        ))}
        <Line
          label={
            shared ? "Allowable bills (your shares)" : "Total allowable bills"
          }
          op="A"
          value={formatMoney(b.allowableCents)}
        />
        <Line
          label="× days worked from home ÷ days in year"
          op="B ÷ C"
          value={`${b.wfhDays} ÷ ${b.daysInYear}`}
        />
        <Line
          label="Share of bills for remote working"
          value={formatMoney(b.wfhShareCents)}
        />
        <Line
          label="− Employer allowance paid"
          op="D"
          value={formatMoney(b.allowanceCents)}
        />
        <Line
          label={`× ${b.ratePercent}%`}
          value={
            <span className="inline-flex items-center gap-1.5">
              {formatMoney(b.claimableCents)}{" "}
              <ProvenanceTag source="estimate" />
            </span>
          }
          total
        />
      </div>
      <div className="grid gap-2.5 p-4">
        {[STANDARD_RATE_PERCENT, HIGHER_RATE_PERCENT].map((rate) => (
          <div key={rate} className="flex items-center justify-between gap-3">
            <span>Estimated tax back at {rate}%</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="num font-semibold">
                {formatMoney(
                  rate === STANDARD_RATE_PERCENT
                    ? b.taxBackCents.standard
                    : b.taxBackCents.higher,
                )}
              </span>
              <ProvenanceTag source="estimate" />
            </span>
          </div>
        ))}
        {b.flooredAtZero ? (
          <p className="text-sm text-due">
            The employer allowance is more than the share of bills, so
            there&apos;s nothing to claim.
          </p>
        ) : null}
        {missing.length > 0 ? (
          <p className="text-sm text-review">
            {missing.length === 12
              ? "No days worked from home entered yet."
              : `Days worked from home not entered for ${missing.join(", ")}.`}
          </p>
        ) : null}
        <p className="text-xs text-muted">
          Each line is rounded for display; the result is worked out exactly and
          rounded once.
        </p>
      </div>
    </Card>
  );
}

export function ClaimNote({ rule }: { rule: ActiveRule | null }) {
  return (
    <p className={note}>
      Caddy organises evidence and estimates; it never files a claim.{" "}
      {rule?.notes.find((n) => n.includes("highest rate")) ??
        "Relief is given at your highest rate of income tax."}{" "}
      Check every figure in Revenue myAccount before claiming.
    </p>
  );
}
