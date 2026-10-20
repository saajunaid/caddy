// Adds an adult who can sign in to a household. Shared by the Settings invite action and the
// one-off "Add household member" GitHub Action, so it uses relative, type-only imports and
// no Next.js APIs. The caller must pass an admin (secret key) client and must already have
// checked that it is allowed to add people to `householdId`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";

type Admin = SupabaseClient<Database>;

export type AddAdultInput = {
  email: string;
  displayName: string;
  householdId: string;
  /** Who did it, for the audit log. Null for the bootstrap workflow. */
  actorId: string | null;
};

export type AddAdultResult =
  | { status: "added"; userId: string }
  | { status: "already-member"; userId: string };

export class AddAdultError extends Error {}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findUserIdByEmail(
  admin: Admin,
  email: string,
): Promise<string | null> {
  // A household has a handful of accounts, so paging through the list is fine.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error)
      throw new AddAdultError(
        `Couldn't look up existing accounts: ${error.message}`,
      );
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function addAdult(
  admin: Admin,
  input: AddAdultInput,
): Promise<AddAdultResult> {
  const email = normaliseEmail(input.email);
  const displayName = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AddAdultError("Enter a valid email.");
  if (displayName.length < 1 || displayName.length > 60) {
    throw new AddAdultError("Enter a name between 1 and 60 characters.");
  }

  // Create the sign-in account (no email is sent; they sign in with a code later).
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else if (
    created.error?.code === "email_exists" ||
    created.error?.status === 422
  ) {
    userId = await findUserIdByEmail(admin, email);
  } else if (created.error) {
    throw new AddAdultError(
      `Couldn't create the account: ${created.error.message}`,
    );
  }
  if (!userId)
    throw new AddAdultError(
      "Couldn't find or create an account for that email.",
    );

  const existing = await admin
    .from("profiles")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw new AddAdultError(existing.error.message);
  if (existing.data) {
    if (existing.data.household_id === input.householdId)
      return { status: "already-member", userId };
    throw new AddAdultError("That email already belongs to another household.");
  }

  const profile = await admin.from("profiles").insert({
    user_id: userId,
    household_id: input.householdId,
    display_name: displayName,
  });
  if (profile.error)
    throw new AddAdultError(
      `Couldn't add the profile: ${profile.error.message}`,
    );

  const member = await admin.from("household_members").insert({
    household_id: input.householdId,
    display_name: displayName,
    relationship: "adult",
    user_id: userId,
  });
  if (member.error)
    throw new AddAdultError(`Couldn't add the member: ${member.error.message}`);

  const audit = await admin.from("audit_events").insert({
    household_id: input.householdId,
    actor_id: input.actorId,
    action: "adult.added",
    entity_type: "profile",
    entity_id: userId,
  });
  if (audit.error)
    throw new AddAdultError(
      `Couldn't record the change: ${audit.error.message}`,
    );

  return { status: "added", userId };
}
