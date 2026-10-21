"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";

/** Marks every unread notification in the household as read. */
export async function markAllReadAction(): Promise<void> {
  const { profile } = await requireHousehold();
  if (!profile) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  revalidatePath("/", "layout");
}
