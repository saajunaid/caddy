import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteEventAction, saveEventAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ConfirmButton } from "@/modules/family/components/controls";
import { EventFields } from "@/modules/family/components/forms";
import { WhatsAppButton } from "@/modules/family/components/list-panel";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { dangerButtonClass } from "@/modules/family/components/ui";
import { loadEvent, loadMembers } from "@/modules/family/queries";
import { dublinDate, dublinTime } from "@/modules/family/server/time.ts";
import { eventShareText } from "@/modules/family/server/whatsapp.ts";

export const metadata = { title: "Event" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EventPage({
  params,
}: PageProps<"/family/events/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [event, members] = await Promise.all([loadEvent(id), loadMembers()]);
  if (!event) notFound();
  const date = event.startDate ?? dublinDate(event.startsAt);
  const who = members
    .filter((m) => event.memberIds.includes(m.id))
    .map((m) => m.name);

  return (
    <>
      <BackLink href={`/family?week=${date}`}>Family</BackLink>
      <PageHeader
        eyebrow={
          event.recurrence === "none"
            ? "Event"
            : `Repeats every ${event.recurrence === "weekly" ? "week" : "year"}`
        }
        title={event.title}
        actions={
          <WhatsAppButton
            text={eventShareText({
              title: event.title,
              date,
              lastDate: event.endDate,
              allDay: event.allDay,
              time: event.allDay ? null : dublinTime(event.startsAt),
              endTime:
                !event.allDay && event.endsAt ? dublinTime(event.endsAt) : null,
              location: event.location,
              who,
              notes: event.notes,
            })}
          />
        }
      />
      {event.recurrence !== "none" ? (
        <p className="text-sm text-muted">
          Changes apply to every repeat of this event.
        </p>
      ) : null}
      <Card className="p-4">
        <ActionForm
          action={saveEventAction.bind(null, event.id)}
          submitLabel="Save changes"
          footer={
            <ConfirmButton
              action={deleteEventAction.bind(null, event.id)}
              confirm={
                event.recurrence === "none"
                  ? "Delete this event?"
                  : "Delete this event and all its repeats?"
              }
              className={dangerButtonClass}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </ConfirmButton>
          }
        >
          <EventFields event={event} members={members} defaultDate={date} />
        </ActionForm>
      </Card>
    </>
  );
}
