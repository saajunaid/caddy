"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { parseToCents } from "@/server/domain/money";
import { ALLOWANCE_CATEGORY } from "./categories";
import { daysInMonth } from "./domain/wfh";

export type TaxFormState = { error?: string; notice?: string };

const NO_HOUSEHOLD = "Your account isn't part of a household yet.";
const yearSchema = z.coerce.number().int().min(2022).max(2100);

async function ensureMember(memberId: string): Promise<boolean> {
  if (!z.uuid().safeParse(memberId).success) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("household_members")
    .select("id")
    .eq("id", memberId)
    .maybeSingle();
  return Boolean(data);
}

/** Saves one person's days worked from home for each month of a tax year. Blank = not entered. */
export async function saveWfhDaysAction(
  _prev: TaxFormState,
  formData: FormData,
): Promise<TaxFormState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: NO_HOUSEHOLD };
  const year = yearSchema.safeParse(formData.get("year"));
  const memberId = String(formData.get("memberId") ?? "");
  if (!year.success || !(await ensureMember(memberId))) {
    return { error: "Choose a person and a tax year." };
  }

  const upserts: { month: number; days: number }[] = [];
  const cleared: number[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const raw = String(formData.get(`m${month}`) ?? "").trim();
    if (raw === "") {
      cleared.push(month);
      continue;
    }
    const days = Number(raw);
    const max = daysInMonth(year.data, month);
    if (!/^\d{1,2}$/.test(raw) || days > max) {
      return { error: `Month ${month}: enter whole days from 0 to ${max}.` };
    }
    upserts.push({ month, days });
  }

  const supabase = await createClient();
  if (upserts.length) {
    const { error } = await supabase.from("wfh_days").upsert(
      upserts.map((u) => ({
        household_id: profile.householdId,
        member_id: memberId,
        tax_year: year.data,
        month: u.month,
        days: u.days,
        updated_by: user.id,
      })),
      { onConflict: "member_id,tax_year,month" },
    );
    if (error) return { error: "Couldn't save the days. Try again." };
  }
  if (cleared.length) {
    const { error } = await supabase
      .from("wfh_days")
      .delete()
      .eq("member_id", memberId)
      .eq("tax_year", year.data)
      .in("month", cleared);
    if (error) return { error: "Couldn't clear the empty months. Try again." };
  }
  revalidatePath("/money/tax", "layout");
  const total = upserts.reduce((sum, u) => sum + u.days, 0);
  return {
    notice: `Saved: ${total} day${total === 1 ? "" : "s"} in ${year.data}.`,
  };
}

/** Records the remote working allowance an employer paid a person for the year (D). */
export async function saveAllowanceAction(
  _prev: TaxFormState,
  formData: FormData,
): Promise<TaxFormState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: NO_HOUSEHOLD };
  const year = yearSchema.safeParse(formData.get("year"));
  const memberId = String(formData.get("memberId") ?? "");
  if (!year.success || !(await ensureMember(memberId))) {
    return { error: "Choose a person and a tax year." };
  }
  const raw = String(formData.get("amount") ?? "").trim();
  let cents = 0;
  if (raw !== "") {
    try {
      cents = parseToCents(raw);
    } catch {
      return { error: "Enter an amount like 320.00." };
    }
    if (cents < 0) return { error: "The allowance can't be negative." };
  }

  const supabase = await createClient();
  const taxYear = await supabase
    .from("tax_years")
    .upsert(
      {
        household_id: profile.householdId,
        jurisdiction: "IE",
        year: year.data,
      },
      { onConflict: "household_id,jurisdiction,year" },
    )
    .select("id")
    .single();
  if (taxYear.error) return { error: "Couldn't open that tax year." };

  await supabase
    .from("tax_evidence_items")
    .delete()
    .eq("tax_year_id", taxYear.data.id)
    .eq("member_id", memberId)
    .eq("category", ALLOWANCE_CATEGORY)
    .is("document_id", null);
  if (cents > 0) {
    const { error } = await supabase.from("tax_evidence_items").insert({
      household_id: profile.householdId,
      tax_year_id: taxYear.data.id,
      member_id: memberId,
      category: ALLOWANCE_CATEGORY,
      paid_cents: cents,
      created_by: user.id,
      notes: "Entered on the tax page",
    });
    if (error) return { error: "Couldn't save the allowance. Try again." };
  }
  revalidatePath("/money/tax", "layout");
  return { notice: cents > 0 ? "Allowance saved." : "Allowance cleared." };
}
