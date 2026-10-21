// The research contract (PLAN §5.1, D13): what any research agent must send to
// POST /api/ingest/research. research/schema/research-result.json is generated from this
// (node --experimental-strip-types scripts/research/build-schema.ts).
import { createHash } from "node:crypto";
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    );
  }, "Not a real calendar date");

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();

export const SOURCE_TYPES = [
  "official",
  "news",
  "social",
  "provider",
  "unknown",
] as const;
export const VERIFICATION_LEVELS = [
  "officially_confirmed",
  "corroborated",
  "reported",
  "unverified",
  "contradicted",
] as const;
export const COST_RENTAL_CONFIRMED = ["yes", "no", "unconfirmed"] as const;

export const researchItemSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe("Headline or a short factual title"),
    url: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .describe("Link to the original source. Used to de-duplicate items"),
    source_name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "Publisher, e.g. 'Limerick City and County Council', 'The Irish Times'",
      ),
    source_type: z
      .enum(SOURCE_TYPES)
      .describe(
        "official = government, council, LDA, Housing Agency; provider = the AHB or landlord; social = social media (leads only)",
      ),
    published_on: isoDate
      .nullable()
      .describe(
        "Date the source was published (YYYY-MM-DD), or null if not shown",
      ),
    summary: optionalText(2000).describe(
      "Two or three factual sentences from the source. No speculation",
    ),
    locality: optionalText(120).describe(
      "Town or area the item is about, e.g. 'Limerick City'",
    ),
    provider: optionalText(200).describe(
      "Housing provider named in the source, if any",
    ),
    cost_rental_confirmed: z
      .enum(COST_RENTAL_CONFIRMED)
      .describe(
        "'yes' only when the source itself says the homes are Cost Rental",
      ),
    verification: z
      .enum(VERIFICATION_LEVELS)
      .describe(
        "officially_confirmed needs an official source; social posts are always unverified",
      ),
  })
  .superRefine((item, ctx) => {
    if (
      item.verification === "officially_confirmed" &&
      item.source_type !== "official"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["verification"],
        message: "officially_confirmed needs source_type 'official'",
      });
    }
    if (
      item.source_type === "social" &&
      !["unverified", "contradicted"].includes(item.verification)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["verification"],
        message: "Social media items are leads only: use 'unverified'",
      });
    }
    if (
      item.cost_rental_confirmed === "yes" &&
      item.source_type !== "official" &&
      item.source_type !== "provider"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cost_rental_confirmed"],
        message:
          "cost_rental_confirmed 'yes' needs an official or provider source",
      });
    }
  });

export const researchResultSchema = z
  .object({
    topic: z.literal("housing"),
    agent: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe(
        "Which runner produced this, e.g. 'claude-code-routine', 'gemini-cli', 'ollama:llama3'",
      ),
    run_started_at: z.iso
      .datetime({ offset: true })
      .describe("When the research run started (ISO 8601 with timezone)"),
    items: z.array(researchItemSchema).max(100),
  })
  .describe(
    "Caddy housing research result: Irish Cost Rental news from the last 30 days",
  );

export type ResearchItem = z.infer<typeof researchItemSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;

/** Readable validation errors, e.g. "items.2.url: Invalid URL". */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join(".")}: ${issue.message}`
      : issue.message,
  );
}

/** Hash of an item's content, so a re-sent item with new wording is recognised as changed. */
export function researchItemHash(item: ResearchItem): string {
  const fields = [
    item.title,
    item.summary ?? "",
    item.source_name,
    item.source_type,
    item.published_on ?? "",
    item.locality ?? "",
    item.provider ?? "",
    item.cost_rental_confirmed,
    item.verification,
  ];
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

/** Whether an item deserves an alert: officially confirmed, or about Limerick. */
export function isAlertWorthy(item: ResearchItem): boolean {
  if (item.verification === "officially_confirmed") return true;
  return [item.locality, item.title, item.summary].some((text) =>
    /\blimerick\b/i.test(text ?? ""),
  );
}

/** The JSON Schema agents validate against (committed as research/schema/research-result.json). */
export function researchJsonSchema(): Record<string, unknown> {
  return {
    $id: "https://caddy-beryl.vercel.app/research/schema/research-result.json",
    ...z.toJSONSchema(researchResultSchema, { target: "draft-2020-12" }),
  };
}
