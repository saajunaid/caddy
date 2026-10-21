import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { FamilyView } from "@/modules/family/components/family-view";
import { NoHousehold } from "@/modules/family/components/page-bits";
import {
  loadEventsBetween,
  loadFeeds,
  loadLists,
  loadMembers,
  loadOpenTasks,
  loadSchools,
  loadTasksDueBetween,
} from "@/modules/family/queries";
import {
  addDays,
  dublinDate,
  isIsoDate,
  weekStart,
} from "@/modules/family/server/time.ts";

export const metadata = { title: "Family" };

export default async function FamilyPage({
  searchParams,
}: PageProps<"/family">) {
  const { profile } = await requireHousehold();
  if (!profile) {
    return (
      <>
        <PageHeader title="Family" />
        <NoHousehold />
      </>
    );
  }
  const params = await searchParams;
  const now = new Date();
  const today = dublinDate(now);
  const requested =
    typeof params.week === "string" && isIsoDate(params.week)
      ? params.week
      : today;
  const start = weekStart(requested);
  const end = addDays(start, 6);
  const supabase = await createClient();

  const [members, events, weekTasks, openTasks, lists, schoolData, feeds] =
    await Promise.all([
      loadMembers(supabase),
      loadEventsBetween(start, end, supabase),
      loadTasksDueBetween(start, end, supabase),
      loadOpenTasks(supabase),
      loadLists(profile.householdId),
      loadSchools(),
      loadFeeds(),
    ]);

  return (
    <FamilyView
      now={now}
      today={today}
      start={start}
      members={members}
      events={events}
      weekTasks={weekTasks}
      openTasks={openTasks}
      lists={lists}
      schools={schoolData.schools}
      applications={schoolData.applications}
      feeds={feeds}
    />
  );
}
