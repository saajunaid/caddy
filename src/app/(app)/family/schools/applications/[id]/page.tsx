import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import {
  deleteApplicationAction,
  saveApplicationAction,
} from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ConfirmButton } from "@/modules/family/components/controls";
import { ApplicationFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { dangerButtonClass } from "@/modules/family/components/ui";
import { loadMembers, loadSchools } from "@/modules/family/queries";

export const metadata = { title: "Application" };

export default async function ApplicationPage({
  params,
}: PageProps<"/family/schools/applications/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  const [{ schools, applications }, members] = await Promise.all([
    loadSchools(),
    loadMembers(),
  ]);
  const application = applications.find((a) => a.id === id);
  if (!application) notFound();
  const school = schools.find((s) => s.id === application.schoolId);
  const children = members.filter((m) => m.relationship === "child");
  const child = members.find((m) => m.id === application.childMemberId);

  return (
    <>
      <BackLink href="/family/schools">School places</BackLink>
      <PageHeader
        eyebrow={child ? `Application · ${child.name}` : "Application"}
        title={school?.name ?? "School"}
      />
      <Card className="p-4">
        <ActionForm
          action={saveApplicationAction.bind(null, application.id)}
          submitLabel="Save changes"
          footer={
            <ConfirmButton
              action={deleteApplicationAction.bind(null, application.id)}
              confirm="Delete this application?"
              className={dangerButtonClass}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </ConfirmButton>
          }
        >
          <ApplicationFields
            application={application}
            schools={schools}
            kids={children}
            defaultYear={application.intakeYear}
          />
        </ActionForm>
      </Card>
    </>
  );
}
