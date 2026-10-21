import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public, non-sensitive liveness check. */
export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
