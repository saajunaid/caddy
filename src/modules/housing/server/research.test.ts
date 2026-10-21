// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  describeIssues,
  isAlertWorthy,
  researchItemHash,
  researchJsonSchema,
  researchResultSchema,
  type ResearchItem,
} from "./research";

function item(overrides: Partial<ResearchItem> = {}): ResearchItem {
  return {
    title: "Council approves Cost Rental homes at Dock Road",
    url: "https://www.limerick.ie/news/example",
    source_name: "Limerick City and County Council",
    source_type: "official",
    published_on: "2026-10-12",
    summary:
      "Planning approved for a mixed development including Cost Rental homes.",
    locality: "Limerick City",
    provider: null,
    cost_rental_confirmed: "unconfirmed",
    verification: "reported",
    ...overrides,
  };
}

function result(items: unknown[]) {
  return {
    topic: "housing",
    agent: "claude-code-routine",
    run_started_at: "2026-10-21T05:30:00Z",
    items,
  };
}

describe("researchResultSchema", () => {
  it("accepts a well-formed result", () => {
    expect(researchResultSchema.safeParse(result([item()])).success).toBe(true);
    expect(researchResultSchema.safeParse(result([])).success).toBe(true);
  });

  it("explains what's wrong", () => {
    const parsed = researchResultSchema.safeParse(
      result([
        item({ url: "not a url", published_on: "21/10/2026" as string }),
      ]),
    );
    expect(parsed.success).toBe(false);
    const issues = describeIssues(parsed.error!);
    expect(issues.some((i) => i.startsWith("items.0.url"))).toBe(true);
    expect(issues).toContain("items.0.published_on: Use a YYYY-MM-DD date");
  });

  it("requires every field, using null for unknowns", () => {
    const withoutSummary: Record<string, unknown> = { ...item() };
    delete withoutSummary.summary;
    expect(
      researchResultSchema.safeParse(result([withoutSummary])).success,
    ).toBe(false);
    expect(
      researchResultSchema.safeParse(result([item({ summary: null })])).success,
    ).toBe(true);
  });

  it("only allows 'officially confirmed' from official sources", () => {
    const parsed = researchResultSchema.safeParse(
      result([
        item({ source_type: "news", verification: "officially_confirmed" }),
      ]),
    );
    expect(parsed.success).toBe(false);
    expect(describeIssues(parsed.error!)).toContain(
      "items.0.verification: officially_confirmed needs source_type 'official'",
    );
  });

  it("keeps social posts as unverified leads", () => {
    expect(
      researchResultSchema.safeParse(
        result([item({ source_type: "social", verification: "reported" })]),
      ).success,
    ).toBe(false);
    expect(
      researchResultSchema.safeParse(
        result([item({ source_type: "social", verification: "unverified" })]),
      ).success,
    ).toBe(true);
  });

  it("only lets official or provider sources confirm Cost Rental", () => {
    expect(
      researchResultSchema.safeParse(
        result([item({ source_type: "news", cost_rental_confirmed: "yes" })]),
      ).success,
    ).toBe(false);
  });

  it("rejects impossible dates and unknown topics", () => {
    expect(
      researchResultSchema.safeParse(
        result([item({ published_on: "2026-02-30" })]),
      ).success,
    ).toBe(false);
    expect(
      researchResultSchema.safeParse({ ...result([]), topic: "travel" })
        .success,
    ).toBe(false);
  });
});

describe("isAlertWorthy", () => {
  it("alerts on officially confirmed items and anything about Limerick", () => {
    expect(isAlertWorthy(item())).toBe(true);
    expect(
      isAlertWorthy(
        item({ locality: "Cork", title: "Cork scheme", summary: null }),
      ),
    ).toBe(false);
    expect(
      isAlertWorthy(
        item({
          locality: "Cork",
          title: "Cork scheme",
          summary: null,
          verification: "officially_confirmed",
        }),
      ),
    ).toBe(true);
  });
});

describe("researchItemHash", () => {
  it("changes with the content", () => {
    expect(researchItemHash(item())).toBe(researchItemHash(item()));
    expect(researchItemHash(item({ verification: "corroborated" }))).not.toBe(
      researchItemHash(item()),
    );
  });
});

describe("research/schema/research-result.json", () => {
  it("matches the Zod contract (run scripts/research/build-schema.ts after changes)", () => {
    const committed = JSON.parse(
      readFileSync(
        new URL(
          "../../../../research/schema/research-result.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(researchJsonSchema())));
  });
});
