import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Supabase client for Client Components (uploads straight to private storage).
 * Uses only public values and the signed-in user's session cookie, so row-level security and
 * storage policies apply exactly as on the server. One instance per page.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Caddy isn't configured yet: Supabase settings are missing.",
    );
  }
  client ??= createBrowserClient<Database>(url, key);
  return client;
}
