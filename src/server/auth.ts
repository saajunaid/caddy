import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

export type HouseholdContext = {
  user: CurrentUser;
  /** Null when the account exists but hasn't been added to a household yet. */
  profile: {
    displayName: string;
    householdId: string;
    householdName: string;
  } | null;
};

/** The signed-in user, or a redirect to /login. Cached per request. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

/** The signed-in user with their profile and household name. Cached per request. */
export const requireHousehold = cache(async (): Promise<HouseholdContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, household_id, households(name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  if (!data) return { user, profile: null };
  return {
    user,
    profile: {
      displayName: data.display_name,
      householdId: data.household_id,
      householdName: data.households?.name ?? "Your household",
    },
  };
});
