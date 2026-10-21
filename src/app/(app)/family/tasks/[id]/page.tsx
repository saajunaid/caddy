import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import {
  deleteTaskAction,
  setTaskDoneAction,
  updateTaskAction,
} from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import {
  CheckToggle,
  ConfirmButton,
} from "@/modules/family/components/controls";
import { TaskFields } from "@/modules/family/components/forms";
import { WhatsAppButton } from "@/modules/family/components/list-panel";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { dangerButtonClass, linkClass } from "@/modules/family/components/ui";
import { loadMembers, loadTask } from "@/modules/family/queries";
import { dublinDate } from "@/modules/family/server/time.ts";
import { taskShareText } from "@/modules/family/server/whatsapp.ts";

export const metadata = { title: "Task" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function TaskPage({
  params,
}: PageProps<"/family/tasks/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [task, members] = await Promise.all([loadTask(id), loadMembers()]);
  if (!task) notFound();
  const assignee = members.find((m) => m.id === task.assigneeMemberId);
  const today = dublinDate(new Date());
  const overdue =
    task.status === "open" && task.dueOn !== null && task.dueOn < today;

  return (
    <>
      <BackLink href="/family/tasks">Tasks</BackLink>
      <PageHeader
        eyebrow="Task"
        title={task.title}
        actions={
          <WhatsAppButton
            text={taskShareText({
              title: task.title,
              dueOn: task.dueOn,
              dueTime: task.dueTime,
              assigneeName: assignee?.name,
              notes: task.notes,
              relatedUrl: task.relatedUrl,
            })}
          />
        }
      />
      <Card className="grid">
        <CheckToggle
          checked={task.status === "done"}
          action={setTaskDoneAction.bind(null, task.id)}
        >
          {task.status === "done" ? "Done" : "Mark as done"}
        </CheckToggle>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-sm">
          {overdue ? <Chip tone="bad">Overdue</Chip> : null}
          {task.recurrence !== "none" ? (
            <Chip tone="neutral" dot={false}>
              Repeats{" "}
              {task.recurrenceInterval > 1
                ? `every ${task.recurrenceInterval} `
                : ""}
              {task.recurrence}
            </Chip>
          ) : null}
          {task.relatedEntityType ? (
            <Chip tone="info" dot={false}>
              From {task.relatedEntityType}
            </Chip>
          ) : null}
          {task.relatedUrl ? (
            <a
              href={task.relatedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} inline-flex items-center gap-1`}
            >
              Open link <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
        </div>
      </Card>
      <Card className="p-4">
        <ActionForm
          action={updateTaskAction.bind(null, task.id)}
          submitLabel="Save changes"
          footer={
            <ConfirmButton
              action={deleteTaskAction.bind(null, task.id)}
              confirm="Delete this task?"
              className={dangerButtonClass}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </ConfirmButton>
          }
        >
          <TaskFields task={task} members={members} returnTo="/family/tasks" />
        </ActionForm>
      </Card>
    </>
  );
}
