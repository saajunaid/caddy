import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteSchoolAction, saveSchoolAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ConfirmButton } from "@/modules/family/components/controls";
import { SchoolFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { buttonClass, dangerButtonClass } from "@/modules/family/components/ui";
import { loadSchools } from "@/modules/family/queries";

export const metadata = { title: "School" };

export default async function SchoolPage({
  params,
}: PageProps<"/family/schools/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  const { schools, applications } = await loadSchools();
  const school = schools.find((s) => s.id === id);
  if (!school) notFound();
  const appCount = applications.filter((a) => a.schoolId === id).length;

  return (
    <>
      <BackLink href="/family/schools">School places</BackLink>
      <PageHeader
        eyebrow="Education planner"
        title={school.name}
        actions={
          <Link
            href={`/family/schools/applications/new?school=${school.id}`}
            className={buttonClass}
          >
            Add application
          </Link>
        }
      />
      <Card className="p-4">
        <ActionForm
          action={saveSchoolAction.bind(null, school.id)}
          submitLabel="Save changes"
          footer={
            <ConfirmButton
              action={deleteSchoolAction.bind(null, school.id)}
              confirm={
                appCount > 0
                  ? `Delete ${school.name} and its ${appCount} application${appCount === 1 ? "" : "s"}?`
                  : `Delete ${school.name}?`
              }
              className={dangerButtonClass}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </ConfirmButton>
          }
        >
          <SchoolFields school={school} />
        </ActionForm>
      </Card>
    </>
  );
}
