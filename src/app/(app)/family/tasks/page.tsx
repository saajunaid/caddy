import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { WhatsAppButton } from "@/modules/family/components/list-panel";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { TaskList } from "@/modules/family/components/tasks";
import { primaryButtonClass } from "@/modules/family/components/ui";
import {
  loadMembers,
  loadOpenTasks,
  loadRecentlyDoneTasks,
  type TaskRow,
} from "@/modules/family/queries";
import { addDays, dublinDate } from "@/modules/family/server/time.ts";
import { tasksShareText } from "@/modules/family/server/whatsapp.ts";

export const metadata = { title: "Tasks" };

function Group({
  title,
  tone,
  tasks,
  today,
  members,
}: {
  title: string;
  tone?: string;
  tasks: TaskRow[];
  today: string;
  members: Awaited<ReturnType<typeof loadMembers>>;
}) {
  if (tasks.length === 0) return null;
  return (
    <Card>
      <h2
        className={`px-4 pt-3.5 pb-1 text-sm font-semibold ${tone ?? "text-muted"}`}
      >
        {title} <span className="num">({tasks.length})</span>
      </h2>
      <TaskList tasks={tasks} today={today} members={members} />
    </Card>
  );
}

export default async function TasksPage() {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const today = dublinDate(new Date());
  const weekAhead = addDays(today, 7);
  const [members, open, done] = await Promise.all([
    loadMembers(),
    loadOpenTasks(),
    loadRecentlyDoneTasks(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const overdue = open.filter((t) => t.dueOn && t.dueOn < today);
  const dueToday = open.filter((t) => t.dueOn === today);
  const soon = open.filter(
    (t) => t.dueOn && t.dueOn > today && t.dueOn <= weekAhead,
  );
  const later = open.filter((t) => t.dueOn && t.dueOn > weekAhead);
  const undated = open.filter((t) => !t.dueOn);

  return (
    <>
      <BackLink href="/family">Family</BackLink>
      <PageHeader
        eyebrow="Family"
        title="Tasks"
        actions={
          <>
            {open.length > 0 ? (
              <WhatsAppButton
                text={tasksShareText(
                  open.map((t) => ({
                    title: t.title,
                    dueOn: t.dueOn,
                    assigneeName: t.assigneeMemberId
                      ? names.get(t.assigneeMemberId)
                      : null,
                  })),
                )}
              />
            ) : null}
            <Link href="/family/tasks/new" className={primaryButtonClass}>
              <Plus aria-hidden="true" className="size-4" />
              New task
            </Link>
          </>
        }
      />
      {open.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing to do">
          Tasks you add show here by due date, with who&apos;s doing them.
          Repeating tasks come back on their next date when you tick them off.
        </EmptyState>
      ) : (
        <>
          <Group
            title="Overdue"
            tone="text-bad"
            tasks={overdue}
            today={today}
            members={members}
          />
          <Group
            title="Today"
            tone="text-due"
            tasks={dueToday}
            today={today}
            members={members}
          />
          <Group
            title="Next 7 days"
            tasks={soon}
            today={today}
            members={members}
          />
          <Group title="Later" tasks={later} today={today} members={members} />
          <Group
            title="No date"
            tasks={undated}
            today={today}
            members={members}
          />
        </>
      )}
      {done.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-info">
            Recently done ({done.length})
          </summary>
          <Card className="mt-2.5">
            <TaskList tasks={done} today={today} members={members} />
          </Card>
        </details>
      ) : null}
    </>
  );
}
