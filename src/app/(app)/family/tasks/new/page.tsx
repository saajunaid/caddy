import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { createTaskAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { TaskFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { loadMembers } from "@/modules/family/queries";
import { isIsoDate } from "@/modules/family/server/time.ts";

export const metadata = { title: "New task" };

export default async function NewTaskPage({
  searchParams,
}: PageProps<"/family/tasks/new">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { due } = await searchParams;
  const members = await loadMembers();
  return (
    <>
      <BackLink href="/family/tasks">Tasks</BackLink>
      <PageHeader eyebrow="Family" title="New task" />
      <Card className="p-4">
        <ActionForm action={createTaskAction} submitLabel="Add task">
          <TaskFields
            members={members}
            returnTo="/family/tasks"
            defaultDueOn={
              typeof due === "string" && isIsoDate(due) ? due : undefined
            }
          />
        </ActionForm>
      </Card>
    </>
  );
}
