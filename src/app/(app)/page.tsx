import Link from "next/link";
import { connection } from "next/server";
import { Activity, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { NAV_ITEMS } from "@/modules/nav";
import { dublinDate, formatLongDate, greetingFor } from "@/server/domain/dates";

export const metadata = { title: "Today" };

const MODULE_IDS = ["housing", "money", "family", "travel"];

export default async function TodayPage() {
  await connection(); // Render per request so the date and greeting are always current.
  const now = new Date();
  const modules = NAV_ITEMS.filter((item) => MODULE_IDS.includes(item.id));

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(dublinDate(now))}
        title={greetingFor(now)}
      />

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
