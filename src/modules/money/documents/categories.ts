// Expense categories (must match the check constraint on public.expenses). Pure.
import type { DocumentType } from "./fields.ts";

export const EXPENSE_CATEGORIES = [
  "utilities_electricity",
  "utilities_gas",
  "broadband",
  "groceries",
  "childcare",
  "education",
  "transport",
  "housing",
  "health",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  utilities_electricity: "Utilities · electricity",
  utilities_gas: "Utilities · gas",
  broadband: "Broadband",
  groceries: "Groceries",
  childcare: "Childcare",
  education: "Education",
  transport: "Transport",
  housing: "Housing",
  health: "Health",
  other: "Other",
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export const PAYMENT_STATUSES = ["paid", "unpaid", "unknown"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  unpaid: "Not paid yet",
  unknown: "Unknown",
};

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

/** Suggested spending category for a document type. The user can change it. */
export function expenseCategoryFor(type: DocumentType | null): ExpenseCategory {
  switch (type) {
    case "electricity_bill":
    case "dual_fuel_bill":
      return "utilities_electricity";
    case "gas_bill":
      return "utilities_gas";
    case "broadband_bill":
      return "broadband";
    case "receipt":
      return "groceries";
    default:
      return "other";
  }
}
