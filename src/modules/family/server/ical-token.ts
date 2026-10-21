// Calendar feed tokens: random, shown once, stored only as a SHA-256 hash.
// Runs in plain Node (relative imports, no Next.js APIs).
import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

/** A new 256-bit URL-safe token. */
export function generateFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Lower-case hex SHA-256, the only form stored in the database. */
export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The token from a feed URL path segment, or null if it can't be one.
 * Accepts a trailing ".ics", which some calendar apps like to see.
 */
export function parseFeedToken(segment: string): string | null {
  const token = segment.endsWith(".ics") ? segment.slice(0, -4) : segment;
  return TOKEN.test(token) ? token : null;
}

/** https:// and webcal:// URLs for a token on the given origin. */
export function feedUrls(
  origin: string,
  token: string,
): { https: string; webcal: string } {
  const https = `${origin.replace(/\/$/, "")}/api/ical/${token}.ics`;
  return { https, webcal: https.replace(/^https?:\/\//, "webcal://") };
}

/** Whether last_used_at is stale enough to update (at most hourly). */
export function shouldTouchLastUsed(
  lastUsedAt: Date | null,
  now: Date,
): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= 3_600_000;
}
