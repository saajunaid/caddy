"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { addAdult, AddAdultError } from "@/server/household/add-adult.ts";

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
