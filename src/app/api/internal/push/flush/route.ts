import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  flushPendingPushes,
  vapidFromEnv,
} from "@/server/notifications/push.ts";

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
 * Called by background jobs after they create notifications. Jobs authenticate with the same
 * Supabase secret key they already hold, so no extra secret is needed.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const vapid = vapidFromEnv();
  if (!vapid) {
    return NextResponse.json({
      notifications: 0,
      delivered: 0,
      note: "push not configured",
    });
  }
  const result = await flushPendingPushes(createAdminClient(), vapid);
  return NextResponse.json(result);
}
