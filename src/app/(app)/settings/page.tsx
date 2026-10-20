import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { signOutAction } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await requireHousehold();
  const supabase = await createClient();
  const members = profile
    ? await supabase
        .from("household_members")
        .select("id, display_name, relationship, user_id")
        .eq("is_active", true)
        .order("created_at")
    : null;
  if (members?.error)
    throw new Error(
      `Couldn't load household members: ${members.error.message}`,
    );

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <div className="grid content-start gap-[22px]">
          <Card className="grid gap-3 p-4">
            <h2 className="text-[1.05rem] font-semibold">
              {profile ? profile.householdName : "Household"}
            </h2>
            {profile && members?.data ? (
              <ul className="divide-y divide-line">
                {members.data.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span>{member.display_name}</span>
                    {member.user_id === user.id ? (
                      <Chip tone="mine" dot={false}>
                        You
                      </Chip>
                    ) : (
                      <Chip tone="neutral" dot={false}>
                        {member.user_id
                          ? "Adult"
                          : member.relationship === "child"
                            ? "Child"
                            : "No login"}
                      </Chip>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Your account ({user.email ?? "signed in"}) isn&apos;t part of a
                household yet. Run the &ldquo;Add household member&rdquo; action
                in GitHub to add it.
              </p>
            )}
          </Card>

          {profile ? (
            <Card className="grid gap-3 p-4">
              <h2 className="text-[1.05rem] font-semibold">Invite an adult</h2>
              <InviteForm />
            </Card>
          ) : null}

          <Card className="grid gap-3 p-4">
            <h2 className="text-[1.05rem] font-semibold">Appearance</h2>
            <ThemeSwitcher />
            <p className="text-sm text-muted">
              Dark is Dracula. Light is Alucard, its official light variant.
              System follows your phone or computer.
            </p>
          </Card>
        </div>

        <div className="grid content-start gap-[22px]">
          <Card className="grid gap-2 p-4">
            <h2 className="text-[1.05rem] font-semibold">
              Install on your phone
            </h2>
            <p className="text-sm text-muted">
              <strong className="text-fg">iPhone:</strong> open Caddy in Safari,
              tap Share, then Add to Home Screen. Notifications only work once
              it&apos;s installed.
            </p>
            <p className="text-sm text-muted">
              <strong className="text-fg">Android:</strong> open Caddy in
              Chrome, tap the menu, then Install app.
            </p>
          </Card>
          <EmptyState icon={Activity} title="Background jobs">
            The daily housing check, reminders and backups will list their last
            run and result here.
          </EmptyState>
          <Card className="grid gap-3 p-4">
            <h2 className="text-[1.05rem] font-semibold">Account</h2>
            <p className="text-sm text-muted">
              Signed in as {user.email ?? "unknown email"}.
            </p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted"
              >
                Sign out
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
