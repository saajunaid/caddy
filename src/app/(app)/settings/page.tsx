import { connection } from "next/server";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/status";
import { JobList } from "@/components/jobs/job-list";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { latestJobRuns } from "@/server/jobs/health";
import { signOutAction } from "./actions";
import { HouseholdNameForm } from "./household-name-form";
import { InviteForm } from "./invite-form";
import { PushSettings } from "./push-settings";

export const metadata = { title: "Settings" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="grid gap-3 p-4">
      <h2 className="text-[1.05rem] font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export default async function SettingsPage() {
  await connection();
  const { user, profile } = await requireHousehold();
  const supabase = await createClient();
  const [members, jobs] = await Promise.all([
    profile
      ? supabase
          .from("household_members")
          .select("id, display_name, relationship, user_id")
          .eq("is_active", true)
          .order("created_at")
      : Promise.resolve(null),
    profile ? latestJobRuns() : Promise.resolve([]),
  ]);
  if (members?.error)
    throw new Error(
      `Couldn't load household members: ${members.error.message}`,
    );
  const now = new Date();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <div className="grid content-start gap-[22px]">
          <Section title="Household">
            {profile && members?.data ? (
              <>
                <HouseholdNameForm name={profile.householdName} />
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
              </>
            ) : (
              <p className="text-sm text-muted">
                Your account ({user.email ?? "signed in"}) isn&apos;t part of a
                household yet. Ask an adult in your household to add you.
              </p>
            )}
          </Section>

          {profile ? (
            <Section title="Invite an adult">
              <InviteForm />
            </Section>
          ) : null}

          <Section title="Notifications">
            <PushSettings />
          </Section>

          <Section title="Appearance">
            <ThemeSwitcher />
            <p className="text-sm text-muted">
              Dark is Dracula. Light uses warm neutrals with Dracula&apos;s
              light accents. System follows your phone or computer.
            </p>
          </Section>
        </div>

        <div className="grid content-start gap-[22px]">
          <Section title="Background jobs">
            {jobs.length > 0 ? (
              <JobList jobs={jobs} now={now} />
            ) : (
              <p className="text-sm text-muted">
                No jobs have run yet. The daily check runs each morning; each
                run shows here with its result, and a failed run is never shown
                as &ldquo;nothing found&rdquo;.
              </p>
            )}
          </Section>
          <Section title="Install on your phone">
            <p className="text-sm text-muted">
              <strong className="text-fg">iPhone:</strong> open Caddy in Safari,
              tap Share, then Add to Home Screen. Notifications only work once
              it&apos;s installed.
            </p>
            <p className="text-sm text-muted">
              <strong className="text-fg">Android:</strong> open Caddy in
              Chrome, tap the menu, then Install app.
            </p>
          </Section>
          <Section title="Account">
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
          </Section>
        </div>
      </div>
    </>
  );
}
