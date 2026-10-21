// What the review screen sends when a document is saved. Validated on the server with zod.
import { z } from "zod";
import { EXPENSE_CATEGORIES, PAYMENT_STATUSES } from "./categories";
import { BILL_TAX_CATEGORIES } from "../tax/categories";

export const reviewPayloadSchema = z.object({
  documentId: z.uuid(),
  /** Raw text the user sees for each field (validated per field with parseFieldInput). */
  fields: z.record(z.string(), z.string().max(200)),
  expense: z.object({
    enabled: z.boolean(),
    category: z.enum(EXPENSE_CATEGORIES),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    isRecurring: z.boolean(),
  }),
  tax: z.object({
    enabled: z.boolean(),
    year: z.number().int().min(2022).max(2100),
    category: z.enum(BILL_TAX_CATEGORIES),
    /** Amount counted for the year; empty = the bill total. */
    amount: z.string().max(20),
    members: z
      .array(
        z.object({
          memberId: z.uuid(),
          sharePercent: z.string().max(6),
        }),
      )
      .max(10),
  }),
});

export type ReviewPayload = z.infer<typeof reviewPayloadSchema>;

export type ReviewState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
