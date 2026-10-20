import Link from "next/link";
import { connection } from "next/server";
import { Activity, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { NAV_ITEMS } from "@/modules/nav";
import { requireHousehold } from "@/server/auth";
import { dublinDate, formatLongDate, greetingFor } from "@/server/domain/dates";

export const metadata = { title: "Today" };

const MODULE_IDS = ["housing", "money", "family", "travel"];

export default async function TodayPage() {
  await connection(); // Render per request so the date and greeting are always current.
  const { profile } = await requireHousehold();
  const now = new Date();
  const firstName = profile?.displayName.split(" ")[0];
  const modules = NAV_ITEMS.filter((item) => MODULE_IDS.includes(item.id));

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(dublinDate(now))}
        title={
          firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now)
        }
      />

      {profile ? null : (
        <Card className="grid gap-1 border-review/50 p-4">
          <h2 className="text-[1.05rem] font-semibold">
            Your account isn&apos;t linked yet
          </h2>
          <p className="text-muted">
            You&apos;re signed in, but your account isn&apos;t part of a
            household. An adult in your household can add you from Settings.
          </p>
        </Card>
      )}

      <Card>
        <div className="px-4 pt-4 pb-1.5">
          <h2 className="text-[1.05rem] font-semibold">Needs you</h2>
        </div>
        <p className="px-4 pb-4 text-muted">
          Nothing yet. New homes, deadlines, bills to review and contract
          reminders will appear here once each section is set up.
        </p>
      </Card>

      <section className="grid gap-2.5">
        <h2 className="text-[1.05rem] font-semibold">Sections</h2>
        <Card className="divide-y divide-line">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-fg/4"
              >
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-sm text-muted">
                    {item.description}
                  </span>
                </span>
                <Chip tone="neutral">Not set up</Chip>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
              </Link>
            );
          })}
        </Card>
      </section>

      <EmptyState icon={Activity} title="Background checks">
        No checks have run yet. Once the daily housing check and reminders are
        switched on, each run shows here with its time and result, and a failed
        run is never shown as &ldquo;nothing found&rdquo;.
      </EmptyState>
    </>
  );
}
