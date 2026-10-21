import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { saveSchoolAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { SchoolFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";

export const metadata = { title: "Add school" };

export default async function NewSchoolPage() {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  return (
    <>
      <BackLink href="/family/schools">School places</BackLink>
      <PageHeader eyebrow="Education planner" title="Add a school" />
      <Card className="p-4">
        <ActionForm
          action={saveSchoolAction.bind(null, null)}
          submitLabel="Add school"
        >
          <SchoolFields />
        </ActionForm>
      </Card>
    </>
  );
}
