import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { createTaskAction } from "../actions";
import type {
  Application,
  EventRow,
  FamilyList,
  Feed,
  Member,
  School,
  TaskRow,
} from "../queries";
import { addDays, formatDayMonth, weekStart } from "../server/time.ts";
import { buildWeek } from "../server/week.ts";
import { tasksShareText } from "../server/whatsapp.ts";
import { ActionForm } from "./action-form";
import { CalendarCard, PeopleCard, SchoolCard } from "./cards";
import { ListPanel, WhatsAppButton } from "./list-panel";
import { AddMenu } from "./page-bits";
import { TaskList } from "./tasks";
import { buttonClass, inputClass } from "./ui";
import { WeekGrid } from "./week-grid";

const TASKS_ON_CARD = 8;

export type FamilyViewData = {
  now: Date;
  today: string;
  /** Monday of the week shown. */
  start: string;
  members: Member[];
  events: EventRow[];
  weekTasks: TaskRow[];
  openTasks: TaskRow[];
  lists: FamilyList[];
  schools: School[];
  applications: Application[];
  feeds: Feed[];
};

/** The Family page: week, tasks, lists, school places, people and calendar feed. */
export function FamilyView({
  now,
  today,
  start,
  members,
  events,
  weekTasks,
  openTasks,
  lists,
  schools,
  applications,
  feeds,
}: FamilyViewData) {
  const end = addDays(start, 6);
  const week = buildWeek({ anyDate: start, today, events, tasks: weekTasks });
  const thisWeek = weekStart(today);
  const year = Number(today.slice(0, 4));
  const mainList = lists.find((l) => l.kind === "shopping") ?? lists[0] ?? null;
  const memberNames = new Map(members.map((m) => [m.id, m.name]));

  return (
    <>
      <PageHeader
        eyebrow={`Week of ${formatDayMonth(start, year)}`}
        title="Family"
        actions={
          <>
            <a href="#calendar" className={buttonClass}>
              <CalendarDays aria-hidden="true" className="size-4" />
              Subscribe in calendar
            </a>
            <AddMenu date={start === thisWeek ? today : start} />
          </>
        }
      />

      <nav
        aria-label="Weeks"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/family?week=${week.previous}`}
            className={buttonClass}
            aria-label="Previous week"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Link>
          {start !== thisWeek ? (
            <Link href="/family" className={buttonClass}>
              This week
            </Link>
          ) : null}
          <Link
            href={`/family?week=${week.next}`}
            className={buttonClass}
            aria-label="Next week"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <span className="num text-sm text-muted">
          {formatDayMonth(start, year)} – {formatDayMonth(end, year)}
          {week.clashCount > 0 ? (
            <>
              {" "}
              <Chip tone="due">
                {week.clashCount} clash{week.clashCount === 1 ? "" : "es"}
              </Chip>
            </>
          ) : null}
        </span>
      </nav>

      <WeekGrid week={week} today={today} members={members} />

      <div className="grid gap-[22px] lg:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <Card className="grid content-start">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-1.5">
            <h2 className="text-[1.05rem] font-semibold">Tasks</h2>
            <div className="flex flex-wrap gap-2">
              {openTasks.length > 0 ? (
                <WhatsAppButton
                  label="Share"
                  text={tasksShareText(
                    openTasks.slice(0, 20).map((t) => ({
                      title: t.title,
                      dueOn: t.dueOn,
                      assigneeName: t.assigneeMemberId
                        ? memberNames.get(t.assigneeMemberId)
                        : null,
                    })),
                  )}
                />
              ) : null}
              <Link href="/family/tasks" className={buttonClass}>
                All tasks
              </Link>
            </div>
          </div>
          {openTasks.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted">
              No open tasks. Add one below, or with Add → Task for a due date,
              person or repeat.
            </p>
          ) : (
            <TaskList
              tasks={openTasks.slice(0, TASKS_ON_CARD)}
              today={today}
              members={members}
            />
          )}
          {openTasks.length > TASKS_ON_CARD ? (
            <Link
              href="/family/tasks"
              className="border-t border-line px-4 py-2.5 text-sm text-info hover:underline"
            >
              {openTasks.length - TASKS_ON_CARD} more open task
              {openTasks.length - TASKS_ON_CARD === 1 ? "" : "s"}
            </Link>
          ) : null}
          <div className="border-t border-line px-4 py-3">
            <ActionForm
              action={createTaskAction}
              submitLabel="Add"
              pendingLabel="Adding…"
              submitClassName={buttonClass}
              resetOnSuccess
              inline
              ariaLabel="Quick add task"
            >
              <input
                name="title"
                required
                maxLength={200}
                autoComplete="off"
                placeholder="Add a task"
                aria-label="New task"
                className={inputClass}
              />
            </ActionForm>
          </div>
        </Card>

        <Card className="grid content-start">
          {mainList ? (
            <ListPanel
              list={mainList}
              heading={
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[1.05rem] font-semibold">
                    {mainList.name}
                  </h2>
                  <Link
                    href="/family/lists"
                    className="text-sm text-info hover:underline"
                  >
                    {lists.length > 1 ? `All lists (${lists.length})` : "Lists"}
                  </Link>
                </div>
              }
            />
          ) : null}
        </Card>
      </div>

      <SchoolCard schools={schools} applications={applications} today={today} />

      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <PeopleCard members={members} today={today} />
        <CalendarCard feeds={feeds} now={now} />
      </div>
    </>
  );
}
