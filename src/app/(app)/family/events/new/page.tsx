import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { saveEventAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { EventFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { loadMembers } from "@/modules/family/queries";
import { dublinDate, isIsoDate } from "@/modules/family/server/time.ts";

export const metadata = { title: "New event" };

export default async function NewEventPage({
  searchParams,
}: PageProps<"/family/events/new">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { date } = await searchParams;
  const members = await loadMembers();
  const defaultDate =
    typeof date === "string" && isIsoDate(date) ? date : dublinDate(new Date());
  return (
    <>
      <BackLink href={`/family?week=${defaultDate}`}>Family</BackLink>
      <PageHeader eyebrow="Family" title="New event" />
      <Card className="p-4">
        <ActionForm
          action={saveEventAction.bind(null, null)}
          submitLabel="Add event"
        >
          <EventFields members={members} defaultDate={defaultDate} />
        </ActionForm>
      </Card>
    </>
  );
}
