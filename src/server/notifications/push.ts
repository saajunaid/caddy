// Sends web push for notifications that haven't been pushed yet.
// Relative imports with .ts and no Next.js APIs (used by an API route; testable in Node).
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "../../lib/supabase/database.types.ts";

type Admin = SupabaseClient<Database>;

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function vapidFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT || "https://caddy-beryl.vercel.app",
  };
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function sendTo(
  admin: Admin,
  vapid: VapidConfig,
  subscription: Subscription,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: 60 * 60 * 12, urgency: "normal" },
    );
    await admin
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .eq("id", subscription.id);
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // The browser revoked this subscription; forget the device.
      await admin.from("push_subscriptions").delete().eq("id", subscription.id);
    } else {
      await admin
        .from("push_subscriptions")
        .update({ last_failure_at: new Date().toISOString() })
        .eq("id", subscription.id);
    }
    return false;
  }
}

/** Push one message to every device in a household. Returns how many devices accepted it. */
export async function pushToHousehold(
  admin: Admin,
  vapid: VapidConfig,
  householdId: string,
  payload: PushPayload,
): Promise<number> {
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("household_id", householdId);
  if (error) throw new Error(`Couldn't load devices: ${error.message}`);
  const results = await Promise.all(
    data.map((s) => sendTo(admin, vapid, s, payload)),
  );
  return results.filter(Boolean).length;
}

/** Push every notification from the last day that hasn't been pushed. Safe to call repeatedly. */
export async function flushPendingPushes(
  admin: Admin,
  vapid: VapidConfig,
): Promise<{ notifications: number; delivered: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("notifications")
    .select("id, household_id, title, body, action_url, kind")
    .eq("push", true)
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(50);
  if (error) throw new Error(`Couldn't load notifications: ${error.message}`);

  let delivered = 0;
  for (const n of data) {
    // Mark first so a crash mid-send can't cause a repeat on the next flush.
    await admin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", n.id);
    delivered += await pushToHousehold(admin, vapid, n.household_id, {
      title: n.title,
      body: n.body ?? undefined,
      url: n.action_url ?? "/inbox",
      tag: n.kind,
    });
  }
  return { notifications: data.length, delivered };
}
