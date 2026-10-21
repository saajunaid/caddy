import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestResearch } from "@/modules/housing/server/ingest-research.ts";
import {
  describeIssues,
  researchResultSchema,
} from "@/modules/housing/server/research.ts";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;

function matches(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Constant-time check of the bearer token. Accepts the Supabase secret key (what jobs hold)
 * or, if set, a dedicated RESEARCH_INGEST_TOKEN so a research agent needn't hold the key.
 */
function authorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  return (
    matches(token, process.env.SUPABASE_SECRET_KEY) ||
    matches(token, process.env.RESEARCH_INGEST_TOKEN)
  );
}

/**
 * Research agents (Claude Code routine, Gemini CLI, a local model…) POST their result here.
 * The contract is research/prompts/housing-news.md + research/schema/research-result.json.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large (max 512 KB)." },
      { status: 413 },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      {
        error:
          "Body must be JSON matching research/schema/research-result.json.",
      },
      { status: 400 },
    );
  }
  const parsed = researchResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload doesn't match the research schema.",
        issues: describeIssues(parsed.error),
      },
      { status: 400 },
    );
  }

  const outcome = await ingestResearch(createAdminClient(), parsed.data);
  return NextResponse.json(
    {
      status: outcome.status,
      run_id: outcome.runId,
      summary: outcome.summary,
      received: outcome.received,
      inserted: outcome.inserted,
      updated: outcome.updated,
      notified: outcome.notified,
      ...(outcome.error ? { error: outcome.error } : {}),
    },
    { status: outcome.status === "failed" ? 500 : 200 },
  );
}
