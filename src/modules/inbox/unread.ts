import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Unread inbox notifications for the signed-in household. A convenience: never throws. */
export async function unreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0; // The badge is a convenience; never block the page on it.
  }
}
