import Link from "next/link";
import { Repeat } from "lucide-react";
import { setTaskDoneAction } from "../actions";
import type { Member, TaskRow } from "../queries";
import { relativeDay } from "../server/time.ts";
import { Avatar } from "./avatar";
import { CheckBox } from "./controls";

function dueText(task: TaskRow, today: string) {
  if (!task.dueOn) return { text: "No date", tone: "text-muted" };
  const when = relativeDay(task.dueOn, today);
  const time = task.dueTime ? ` ${task.dueTime}` : "";
  if (task.status === "open" && task.dueOn < today)
    return { text: `Overdue · ${when}`, tone: "text-bad" };
  if (task.status === "open" && task.dueOn === today)
    return { text: `Today${time}`, tone: "text-due" };
  return { text: `${when}${time}`, tone: "text-muted" };
}

/** One task: tick box, assignee initials, title (links to edit), due date. */
export function TaskItem({
  task,
  today,
  members,
}: {
  task: TaskRow;
  today: string;
  members: Map<string, Member>;
}) {
  const assignee = task.assigneeMemberId
    ? members.get(task.assigneeMemberId)
    : undefined;
  const due = dueText(task, today);
  const done = task.status === "done";
  return (
    <li className="flex min-h-12 items-center gap-3 px-4 py-2">
      <CheckBox
        checked={done}
        action={setTaskDoneAction.bind(null, task.id)}
        label={`${task.title} done`}
      />
      {assignee ? (
        <Avatar name={assignee.name} />
      ) : (
        <span className="size-[26px] shrink-0" aria-hidden="true" />
      )}
      <Link
        href={`/family/tasks/${task.id}`}
        className={`min-w-0 flex-1 wrap-anywhere hover:underline ${done ? "text-muted line-through" : ""}`}
      >
        {task.title}
        {task.recurrence !== "none" ? (
          <Repeat
            aria-label="Repeats"
            className="ml-1.5 inline size-3.5 align-[-2px] text-muted"
          />
        ) : null}
      </Link>
      <span className={`num shrink-0 text-right text-xs ${due.tone}`}>
        {done && task.completedAt ? "Done" : due.text}
      </span>
    </li>
  );
}

export function TaskList({
  tasks,
  today,
  members,
}: {
  tasks: TaskRow[];
  today: string;
  members: Member[];
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} today={today} members={byId} />
      ))}
    </ul>
  );
}
