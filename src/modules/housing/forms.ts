// Validation for the Housing forms. Pure; shared by the server actions and tests.
import { z } from "zod";
import { APPLICATION_STATUSES } from "./display";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((v) => (v === "" ? null : v));

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) =>
        v === "" ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(`${v}T00:00:00Z`))),
      `${label} must be a date`,
    )
    .transform((v) => (v === "" ? null : v));

const optionalCount = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d{1,6}$/.test(v),
      `${label} must be a whole number`,
    )
    .transform((v) => (v === "" ? null : Number(v)));

export const applicationFormSchema = z.object({
  status: z.enum(APPLICATION_STATUSES as [string, ...string[]], {
    error: "Choose a status",
  }),
  applied_on: optionalDate("Applied on"),
  provider_reference: optionalText(120, "Reference"),
  outcome_text: optionalText(4000, "Outcome"),
  next_action: optionalText(300, "Next action"),
  next_action_due: optionalDate("Due date"),
  notes: optionalText(4000, "Notes"),
});

export type ApplicationInput = z.infer<typeof applicationFormSchema>;

export const PROJECT_CONFIRMATION = ["yes", "no", "unconfirmed"] as const;
export const PROJECT_VERIFICATION = [
  "lead",
  "reported",
  "officially_confirmed",
  "contradicted",
  "needs_verification",
] as const;

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(200, "Name is too long"),
    locality: optionalText(120, "Locality"),
    county: optionalText(60, "County"),
    provider: optionalText(200, "Provider"),
    stage: optionalText(200, "Stage"),
    total_homes: optionalCount("Total homes"),
    cost_rental_homes: optionalCount("Cost Rental homes"),
    bedroom_mix: optionalText(200, "Bedroom mix"),
    cost_rental_confirmed: z.enum(PROJECT_CONFIRMATION),
    expected_date_text: optionalText(120, "Expected date"),
    source_url: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || /^https?:\/\/\S+$/.test(v),
        "Source must be a web link (https://…)",
      )
      .transform((v) => (v === "" ? null : v)),
    notes: optionalText(4000, "Notes"),
    verification: z.enum(PROJECT_VERIFICATION),
    last_checked_on: optionalDate("Last checked"),
  })
  .superRefine((value, ctx) => {
    if (
      (value.verification === "officially_confirmed" ||
        value.cost_rental_confirmed === "yes") &&
      !value.source_url
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["source_url"],
        message: "Add the official source link before marking this confirmed",
      });
    }
  });

export type ProjectInput = z.infer<typeof projectFormSchema>;

/** FormData → plain strings for the schemas (missing fields become ""). */
export function formValues(
  formData: FormData,
  keys: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    keys.map((k) => [k, String(formData.get(k) ?? "")]),
  );
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
