// Creates the household (if there isn't one yet) and adds an adult who can sign in.
// Run by the "Add household member" GitHub Action; sign-ups are switched off, so this is how
// the first account is made. Usage:
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... MEMBER_EMAIL=... MEMBER_NAME=... \
//   node --experimental-strip-types scripts/add-household-member.ts
import { createClient } from "@supabase/supabase-js";
import { addAdult, AddAdultError } from "../src/server/household/add-adult.ts";
import type { Database } from "../src/lib/supabase/database.types.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

const admin = createClient<Database>(
  required("SUPABASE_URL"),
  required("SUPABASE_SECRET_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const email = required("MEMBER_EMAIL");
const displayName = required("MEMBER_NAME");
const householdName = process.env.HOUSEHOLD_NAME?.trim() || "Our household";

const households = await admin
  .from("households")
  .select("id, name")
  .order("created_at");
if (households.error) {
  console.error(`Couldn't read households: ${households.error.message}`);
  process.exit(1);
}
if (households.data.length > 1) {
  console.error(
    "More than one household exists; add people from the app's Settings instead.",
  );
  process.exit(1);
}

let householdId = households.data[0]?.id;
if (!householdId) {
  const created = await admin
    .from("households")
    .insert({ name: householdName })
    .select("id")
    .single();
  if (created.error) {
    console.error(`Couldn't create the household: ${created.error.message}`);
    process.exit(1);
  }
  householdId = created.data.id;
  console.log(`Created household "${householdName}".`);
}

try {
  const result = await addAdult(admin, {
    email,
    displayName,
    householdId,
    actorId: null,
  });
  console.log(
    result.status === "added"
      ? `Added ${displayName}. They can now sign in with their email.`
      : `${displayName} was already in this household. Nothing changed.`,
  );
} catch (error) {
  console.error(error instanceof AddAdultError ? error.message : error);
  process.exit(1);
}
