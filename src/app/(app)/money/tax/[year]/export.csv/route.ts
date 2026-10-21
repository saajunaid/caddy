import type { NextRequest } from "next/server";
import {
  isTaxCategory,
  TAX_CATEGORY_LABELS,
} from "@/modules/money/tax/categories";
import { taxYearCsv } from "@/modules/money/tax/domain/csv";
import {
  isSupportedYear,
  loadTaxYear,
} from "@/modules/money/tax/server/queries";
import { requireHousehold } from "@/server/auth";

/** CSV of a tax year's evidence and estimates, for the signed-in household only. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/money/tax/[year]/export.csv">,
) {
  const { year: raw } = await ctx.params;
  const year = Number(raw);
  const { profile } = await requireHousehold();
  if (!profile) return new Response("Not part of a household", { status: 403 });
  if (!/^\d{4}$/.test(raw) || !isSupportedYear(year)) {
    return new Response("Unknown tax year", { status: 404 });
  }
  const data = await loadTaxYear(year);
  const csv = taxYearCsv(data.summary, {
    generatedOn: data.today,
    categoryLabel: (c) => (isTaxCategory(c) ? TAX_CATEGORY_LABELS[c] : c),
  });
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="caddy-tax-${year}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
