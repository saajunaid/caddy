import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase client with the secret key. Bypasses row-level security, so use it only for
 * actions the app itself must perform (inviting an adult, background jobs) and always
 * check the caller's household first. Never import this from client code.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Add it in Vercel (Sensitive).",
    );
  }
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    secretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
