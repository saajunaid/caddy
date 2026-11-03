import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPendingEmails } from "@/server/notifications/send-emails";

export const dynamic = "force-dynamic";

/** Constant-time check of the bearer token against the Supabase secret key. */
function authorised(request: NextRequest): boolean {
  const expected = process.env.SUPABASE_SECRET_KEY;
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Called by background jobs after the push flush, like /api/internal/push/flush. Email is sent
 * only from here, so the SMTP password lives only in Vercel. PLAN D29.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await sendPendingEmails(createAdminClient()));
}
