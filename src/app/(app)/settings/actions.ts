"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { addAdult, AddAdultError } from "@/server/household/add-adult.ts";
import { notify } from "@/server/notifications/notify.ts";
import { pushToHousehold, vapidFromEnv } from "@/server/notifications/push.ts";

export type InviteState = { error?: string; notice?: string };

export async function inviteAdultAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  // Only an adult who already belongs to a household can add someone to it.
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };

  const email = String(formData.get("email") ?? "");
  const displayName = String(formData.get("name") ?? "");
  try {
    const result = await addAdult(createAdminClient(), {
      email,
      displayName,
      householdId: profile.householdId,
      actorId: user.id,
    });
    revalidatePath("/settings");
    return {
      notice:
        result.status === "added"
          ? `${displayName.trim()} can now sign in to Caddy with ${email.trim().toLowerCase()}.`
          : `${displayName.trim()} is already in your household.`,
    };
  } catch (error) {
    if (error instanceof AddAdultError) return { error: error.message };
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type FormState = { error?: string; notice?: string };

export async function renameHouseholdAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return { error: "Enter a name between 1 and 80 characters." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({ name })
    .eq("id", profile.householdId);
  if (error) return { error: "Couldn't rename the household. Try again." };
  await supabase.from("audit_events").insert({
    household_id: profile.householdId,
    actor_id: user.id,
    action: "household.renamed",
    entity_type: "household",
    entity_id: profile.householdId,
  });
  revalidatePath("/", "layout");
  return { notice: `Renamed to “${name}”.` };
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function savePushSubscriptionAction(
  subscription: PushSubscriptionInput,
  userAgent: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { ok: false, error: "No household" };
  if (!subscription.endpoint.startsWith("https://")) {
    return { ok: false, error: "Invalid push endpoint" };
  }
  const admin = createAdminClient();
  // Endpoints are unique per device; replace any previous owner of this endpoint.
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").insert({
    household_id: profile.householdId,
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: userAgent.slice(0, 200),
  });
  if (error) return { ok: false, error: "Couldn't save this device" };
  return { ok: true };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<void> {
  await requireHousehold();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function sendTestNotificationAction(): Promise<{
  delivered: number;
  error?: string;
}> {
  const { profile } = await requireHousehold();
  if (!profile) return { delivered: 0, error: "No household" };
  const vapid = vapidFromEnv();
  const admin = createAdminClient();
  await notify(admin, [
    {
      householdId: profile.householdId,
      kind: "test",
      severity: "success",
      title: "Test notification",
      body: "Notifications from Caddy will look like this.",
      actionUrl: "/inbox",
      dedupeKey: `test:${Date.now()}`,
      push: false,
    },
  ]);
  revalidatePath("/", "layout");
  if (!vapid)
    return { delivered: 0, error: "Push isn't configured on the server yet." };
  const delivered = await pushToHousehold(admin, vapid, profile.householdId, {
    title: "Test notification",
    body: "Notifications from Caddy will look like this.",
    url: "/inbox",
    tag: "test",
  });
  return { delivered };
}
