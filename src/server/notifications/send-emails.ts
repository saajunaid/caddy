import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  emailFromEnv,
  flushPendingEmails,
  smtpSender,
  type EmailFlushResult,
} from "./email.ts";

const DEFAULT_APP_URL = "https://caddy-beryl.vercel.app";

/** Sends waiting email alerts if email is set up (SMTP_USER and SMTP_PASSWORD in Vercel). */
export async function sendPendingEmails(
  admin: SupabaseClient<Database>,
): Promise<EmailFlushResult | { note: string }> {
  const config = emailFromEnv();
  if (!config) return { note: "email not configured" };
  const appUrl = (process.env.APP_URL?.trim() || DEFAULT_APP_URL).replace(
    /\/$/,
    "",
  );
  return flushPendingEmails(admin, await smtpSender(config), appUrl);
}

/** Whether email alerts are switched on for this deployment (for Settings). */
export function emailConfigured(): boolean {
  return emailFromEnv() !== null;
}
