// Creates in-app notifications (and marks them for push). Shared by jobs and the app.
// Relative imports with .ts and no Next.js APIs, so GitHub Actions scripts can use it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";

type Admin = SupabaseClient<Database>;

export type NewNotification = {
  householdId: string;
  kind: string;
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body?: string;
  /** App path to open, e.g. "/housing/abc". */
  actionUrl?: string;
  /** Same key = same alert. Re-running a job never notifies twice. */
  dedupeKey: string;
  jobRunId?: string;
  push?: boolean;
};

/** Inserts notifications, silently skipping ones already sent. Returns how many are new. */
export async function notify(
  admin: Admin,
  items: readonly NewNotification[],
): Promise<number> {
  if (items.length === 0) return 0;
  const { data, error } = await admin
    .from("notifications")
    .upsert(
      items.map((n) => ({
        household_id: n.householdId,
        kind: n.kind,
        severity: n.severity ?? "info",
        title: n.title.slice(0, 160),
        body: n.body ?? null,
        action_url: n.actionUrl ?? null,
        dedupe_key: n.dedupeKey,
        job_run_id: n.jobRunId ?? null,
        push: n.push ?? true,
      })),
      { onConflict: "household_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`Couldn't save notifications: ${error.message}`);
  return data?.length ?? 0;
}

/** Every household id. Caddy has one household, but jobs shouldn't assume it. */
export async function allHouseholdIds(admin: Admin): Promise<string[]> {
  const { data, error } = await admin.from("households").select("id");
  if (error) throw new Error(`Couldn't list households: ${error.message}`);
  return data.map((h) => h.id);
}
