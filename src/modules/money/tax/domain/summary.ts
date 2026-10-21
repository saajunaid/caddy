// Everything the tax year screens, print view and CSV export show, built from plain rows. Pure.
import { monthsCovered } from "../../documents/review.ts";
import {
  computeWfhRelief,
  percentToBasisPoints,
  type WfhBreakdown,
  type WfhRule,
} from "./wfh.ts";

export type RuleRecord = {
  ruleCode: string;
  version: number;
  taxYearFrom: number;
  taxYearTo: number | null;
  ruleJson: unknown;
  officialSourceUrl: string;
  reviewedOn: string;
  status: string;
};

export type ActiveRule = {
  record: RuleRecord;
  rule: WfhRule;
  formula: string;
  notes: string[];
};

/** The active remote working rule covering `year`, newest version first. Null if none applies. */
export function selectRule(
  rules: readonly RuleRecord[],
  year: number,
): ActiveRule | null {
  const candidates = rules
    .filter(
      (r) =>
        r.ruleCode === "IE_REMOTE_WORKING_RELIEF" &&
        r.status === "active" &&
        r.taxYearFrom <= year &&
        (r.taxYearTo === null || r.taxYearTo >= year),
    )
    .sort((a, b) => b.version - a.version);
  for (const record of candidates) {
    const parsed = parseRuleJson(record.ruleJson);
    if (parsed) return { record, ...parsed };
  }
  return null;
}

function parseRuleJson(
  json: unknown,
): { rule: WfhRule; formula: string; notes: string[] } | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  const rate = j.rate_percent;
  const categories = j.categories;
  const allowance = j.allowance_category;
  if (
    typeof rate !== "number" ||
    !Number.isInteger(rate) ||
    rate < 0 ||
    rate > 100 ||
    !Array.isArray(categories) ||
    !categories.every((c) => typeof c === "string") ||
    typeof allowance !== "string"
  ) {
    return null;
  }
  return {
    rule: { ratePercent: rate, categories, allowanceCategory: allowance },
    formula: typeof j.formula === "string" ? j.formula : "",
    notes: Array.isArray(j.notes)
      ? j.notes.filter((n) => typeof n === "string")
      : [],
  };
}

export type Member = { id: string; name: string };

export type EvidenceRow = {
  id: string;
  memberId: string;
  category: string;
  paidCents: number;
  /** As stored, e.g. 100 or 33.33. */
  sharePercent: number;
  documentId: string | null;
  supplier: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  documentDate: string | null;
};

export type WfhDayRow = { memberId: string; month: number; days: number };

export type MemberSummary = {
  member: Member;
  daysByMonth: (number | null)[];
  evidence: EvidenceRow[];
  breakdown: WfhBreakdown | null;
};

export type ChecklistLine = {
  category: string;
  /** Months (1–12) with at least one bill as evidence. */
  covered: number[];
  /** Months that should have evidence by now. */
  expected: number[];
  missing: number[];
};

export type YearSummary = {
  year: number;
  rule: ActiveRule | null;
  members: MemberSummary[];
  checklist: ChecklistLine[];
};

/** Months of `year` that have started by `today` (Dublin date, ISO). */
export function monthsSoFar(year: number, today: string): number[] {
  const [ty, tm] = today.split("-").map(Number);
  if (year < ty) return Array.from({ length: 12 }, (_, i) => i + 1);
  if (year > ty) return [];
  return Array.from({ length: tm }, (_, i) => i + 1);
}

export function buildYearSummary(input: {
  year: number;
  today: string;
  rules: readonly RuleRecord[];
  members: readonly Member[];
  evidence: readonly EvidenceRow[];
  wfhDays: readonly WfhDayRow[];
  categories: readonly string[];
}): YearSummary {
  const rule = selectRule(input.rules, input.year);
  const members = input.members.map((member): MemberSummary => {
    const daysByMonth: (number | null)[] = Array(12).fill(null);
    for (const row of input.wfhDays) {
      if (row.memberId === member.id && row.month >= 1 && row.month <= 12) {
        daysByMonth[row.month - 1] = row.days;
      }
    }
    const evidence = input.evidence.filter((e) => e.memberId === member.id);
    const breakdown = rule
      ? computeWfhRelief(rule.rule, {
          year: input.year,
          daysByMonth,
          evidence: evidence.map((e) => ({
            category: e.category,
            paidCents: e.paidCents,
            shareBasisPoints: percentToBasisPoints(e.sharePercent),
          })),
        })
      : null;
    return { member, daysByMonth, evidence, breakdown };
  });

  const expected = monthsSoFar(input.year, input.today);
  const checklist = input.categories.map((category): ChecklistLine => {
    const covered = new Set<number>();
    for (const e of input.evidence) {
      if (e.category !== category) continue;
      for (const m of monthsCovered(
        e.periodStart,
        e.periodEnd,
        e.documentDate,
        input.year,
      )) {
        covered.add(m);
      }
    }
    const sorted = [...covered].sort((a, b) => a - b);
    return {
      category,
      covered: sorted,
      expected,
      missing: expected.filter((m) => !covered.has(m)),
    };
  });

  return { year: input.year, rule, members, checklist };
}
