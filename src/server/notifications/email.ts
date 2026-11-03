// Email copies of the alerts that must not be missed (PLAN D29). Push can fail silently on
// phones, so these also go by email to every adult who hasn't turned email off.
// Sending happens only in the app on Vercel (the jobs call /api/internal/email/flush), so the
// SMTP password lives in one place. Plain Node: relative imports with .ts, no Next.js APIs.
// Never log addresses, and never put document text or account numbers in an email.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";

type Admin = SupabaseClient<Database>;

/** Alerts that are emailed straight away. Everything else stays push + Inbox only.
 * "digest" is the morning summary on days something needs you ("digest.quiet" otherwise). */
export const EMAIL_KINDS: readonly string[] = [
  "housing.match",
  "housing.possible",
  "housing.closing",
  "housing.reopened",
  "utilities.due",
  "family.school_deadline",
  "system.jobs_missing",
  "digest",
];

/** Older alerts are never emailed, so turning email on doesn't send a backlog. */
export const EMAIL_WINDOW_HOURS = 24;

export type EmailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

/** Null (email switched off) until SMTP_USER and SMTP_PASSWORD are set. Gmail by default. */
export function emailFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailConfig | null {
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.trim();
  if (!user || !password) return null;
  const port = Number(env.SMTP_PORT?.trim() || 465);
  return {
    host: env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isFinite(port) ? port : 465,
    user,
    password,
    from: env.EMAIL_FROM?.trim() || `Caddy <${user}>`,
  };
}

export type EmailAlert = {
  title: string;
  body: string | null;
  actionUrl: string | null;
  severity: string;
};

export type EmailMessage = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkFor(appUrl: string, actionUrl: string | null): string {
  // action_url is always an app path ("/..."): the database checks it.
  return `${appUrl}${actionUrl && actionUrl.startsWith("/") ? actionUrl : "/inbox"}`;
}

/** One email per household per send, however many alerts are waiting. Pure. */
export function composeEmail(
  alerts: readonly EmailAlert[],
  appUrl: string,
): EmailMessage {
  const urgent = alerts.some(
    (a) => a.severity === "critical" || a.severity === "warning",
  );
  const subject =
    alerts.length === 1
      ? `Caddy: ${alerts[0].title}`
      : `Caddy: ${alerts.length} alerts${urgent ? ", some urgent" : ""}`;

  const text = [
    ...alerts.map((a) =>
      [a.title, a.body, linkFor(appUrl, a.actionUrl)]
        .filter(Boolean)
        .join("\n"),
    ),
    `Turn these emails off in Caddy: ${appUrl}/settings`,
  ].join("\n\n");

  const items = alerts
    .map(
      (a) =>
        `<li style="margin:0 0 16px"><strong>${escapeHtml(a.title)}</strong>` +
        (a.body ? `<br>${escapeHtml(a.body)}` : "") +
        `<br><a href="${escapeHtml(linkFor(appUrl, a.actionUrl))}">Open in Caddy</a></li>`,
    )
    .join("");
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222">` +
    `<ul style="padding-left:18px">${items}</ul>` +
    `<p style="color:#666;font-size:13px">Turn these emails off in <a href="${escapeHtml(appUrl)}/settings">Caddy settings</a>.</p></div>`;

  return { subject: subject.slice(0, 160), text, html };
}

export type SendEmail = (
  message: EmailMessage & { to: string[] },
) => Promise<void>;

/** Real sender over SMTP. Kept apart so tests can pass a fake. */
export async function smtpSender(config: EmailConfig): Promise<SendEmail> {
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  return async (message) => {
    await transport.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  };
}

/** Addresses of the household's adults who haven't turned email off. */
async function recipients(
  admin: Admin,
  householdId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("email_alerts", true);
  if (error) throw new Error(`Couldn't read email settings: ${error.message}`);
  const emails: string[] = [];
  for (const { user_id } of data) {
    const { data: user } = await admin.auth.admin.getUserById(user_id);
    if (user.user?.email) emails.push(user.user.email);
  }
  return emails;
}

export type EmailFlushResult = {
  notifications: number;
  emails: number;
  failed: number;
};

/** Emails every waiting alert from the last 24 hours, once. Marks them emailed even when
 * nobody wants email, so turning email on later never sends old alerts. */
export async function flushPendingEmails(
  admin: Admin,
  send: SendEmail,
  appUrl: string,
  now: Date = new Date(),
): Promise<EmailFlushResult> {
  const since = new Date(
    now.getTime() - EMAIL_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from("notifications")
    .select("id, household_id, title, body, action_url, severity")
    .is("emailed_at", null)
    .in("kind", [...EMAIL_KINDS])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Couldn't read alerts: ${error.message}`);

  const byHousehold = new Map<string, typeof data>();
  for (const row of data) {
    const list = byHousehold.get(row.household_id) ?? [];
    list.push(row);
    byHousehold.set(row.household_id, list);
  }

  const result: EmailFlushResult = {
    notifications: data.length,
    emails: 0,
    failed: 0,
  };
  for (const [householdId, rows] of byHousehold) {
    try {
      const to = await recipients(admin, householdId);
      if (to.length > 0) {
        await send({
          to,
          ...composeEmail(
            rows.map((r) => ({
              title: r.title,
              body: r.body,
              actionUrl: r.action_url,
              severity: r.severity,
            })),
            appUrl,
          ),
        });
        result.emails += 1;
      }
      const { error: markError } = await admin
        .from("notifications")
        .update({ emailed_at: now.toISOString() })
        .in(
          "id",
          rows.map((r) => r.id),
        );
      if (markError) throw new Error(markError.message);
    } catch {
      // Left unmarked, so the next flush tries again (within the 24-hour window).
      result.failed += 1;
    }
  }
  return result;
}
