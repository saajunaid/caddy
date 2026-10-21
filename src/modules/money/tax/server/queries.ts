import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dublinDate } from "@/server/domain/dates";
import { WFH_CATEGORIES } from "../categories";
import {
  buildYearSummary,
  type EvidenceRow,
  type Member,
  type RuleRecord,
  type YearSummary,
} from "../domain/summary";

export const FIRST_TAX_YEAR = 2022;

/** The current tax year (Irish tax years are calendar years), in Dublin time. */
export function currentTaxYear(now = new Date()): number {
  return Number(dublinDate(now).slice(0, 4));
}

export function isSupportedYear(year: number, now = new Date()): boolean {
  return (
    Number.isInteger(year) &&
    year >= FIRST_TAX_YEAR &&
    year <= currentTaxYear(now) + 1
  );
}

export type TaxYearData = {
  summary: YearSummary;
  /** Adults who can claim (household members with the adult relationship). */
  members: Member[];
  allowanceByMember: Record<string, number>;
  yearsWithData: number[];
  today: string;
};

/** Loads everything for one tax year as the signed-in user (row-level security applies). */
export async function loadTaxYear(year: number): Promise<TaxYearData> {
  const supabase = await createClient();
  const today = dublinDate(new Date());

  const [membersRes, rulesRes, yearsRes, daysRes] = await Promise.all([
    supabase
      .from("household_members")
      .select("id, display_name")
      .eq("relationship", "adult")
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("tax_rules")
      .select(
        "rule_code, version, tax_year_from, tax_year_to, rule_json, official_source_url, reviewed_on, status",
      )
      .eq("jurisdiction", "IE"),
    supabase.from("tax_years").select("id, year").eq("jurisdiction", "IE"),
    supabase
      .from("wfh_days")
      .select("member_id, month, days")
      .eq("tax_year", year),
  ]);
  for (const res of [membersRes, rulesRes, yearsRes, daysRes]) {
    if (res.error)
      throw new Error(`Couldn't load the tax year: ${res.error.message}`);
  }

  const taxYearId = yearsRes.data!.find((y) => y.year === year)?.id ?? null;
  let evidence: EvidenceRow[] = [];
  const allowanceByMember: Record<string, number> = {};
  if (taxYearId) {
    const items = await supabase
      .from("tax_evidence_items")
      .select("id, member_id, category, paid_cents, share_percent, document_id")
      .eq("tax_year_id", taxYearId)
      .order("created_at");
    if (items.error)
      throw new Error(`Couldn't load tax evidence: ${items.error.message}`);
    const docIds = [
      ...new Set(
        items.data.map((i) => i.document_id).filter((id): id is string => !!id),
      ),
    ];
    const docs = docIds.length
      ? await supabase
          .from("documents")
          .select("id, supplier, period_start, period_end, document_date")
          .in("id", docIds)
      : { data: [], error: null };
    if (docs.error)
      throw new Error(
        `Couldn't load evidence documents: ${docs.error.message}`,
      );
    const byId = new Map(docs.data.map((d) => [d.id, d]));
    evidence = items.data.map((i) => {
      const doc = i.document_id ? byId.get(i.document_id) : undefined;
      return {
        id: i.id,
        memberId: i.member_id,
        category: i.category,
        paidCents: i.paid_cents,
        sharePercent: Number(i.share_percent),
        documentId: i.document_id,
        supplier: doc?.supplier ?? null,
        periodStart: doc?.period_start ?? null,
        periodEnd: doc?.period_end ?? null,
        documentDate: doc?.document_date ?? null,
      };
    });
    for (const e of evidence) {
      if (e.category === "employer_remote_working_allowance") {
        allowanceByMember[e.memberId] =
          (allowanceByMember[e.memberId] ?? 0) + e.paidCents;
      }
    }
  }

  const members: Member[] = membersRes.data!.map((m) => ({
    id: m.id,
    name: m.display_name,
  }));
  const rules: RuleRecord[] = rulesRes.data!.map((r) => ({
    ruleCode: r.rule_code,
    version: r.version,
    taxYearFrom: r.tax_year_from,
    taxYearTo: r.tax_year_to,
    ruleJson: r.rule_json,
    officialSourceUrl: r.official_source_url,
    reviewedOn: r.reviewed_on,
    status: r.status,
  }));
  const summary = buildYearSummary({
    year,
    today,
    rules,
    members,
    evidence,
    wfhDays: daysRes.data!.map((d) => ({
      memberId: d.member_id,
      month: d.month,
      days: d.days,
    })),
    categories: WFH_CATEGORIES,
  });

  return {
    summary,
    members,
    allowanceByMember,
    yearsWithData: yearsRes.data!.map((y) => y.year).sort((a, b) => b - a),
    today,
  };
}
