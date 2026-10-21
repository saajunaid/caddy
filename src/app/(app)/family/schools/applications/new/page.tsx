import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { saveApplicationAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ApplicationFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { linkClass } from "@/modules/family/components/ui";
import { loadMembers, loadSchools } from "@/modules/family/queries";
import { dublinDate } from "@/modules/family/server/time.ts";

export const metadata = { title: "Add application" };

export default async function NewApplicationPage({
  searchParams,
}: PageProps<"/family/schools/applications/new">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { school } = await searchParams;
  const [{ schools }, members] = await Promise.all([
    loadSchools(),
    loadMembers(),
  ]);
  const children = members.filter((m) => m.relationship === "child");
  const nextYear = Number(dublinDate(new Date()).slice(0, 4)) + 1;

  return (
    <>
      <BackLink href="/family/schools">School places</BackLink>
      <PageHeader eyebrow="Education planner" title="Add an application" />
      {schools.length === 0 || children.length === 0 ? (
        <Card className="p-4 text-muted">
          Add{" "}
          {schools.length === 0 ? (
            <Link href="/family/schools/new" className={linkClass}>
              a school
            </Link>
          ) : null}
          {schools.length === 0 && children.length === 0 ? " and " : null}
          {children.length === 0 ? (
            <Link href="/family#people" className={linkClass}>
              a child
            </Link>
          ) : null}{" "}
          first.
        </Card>
      ) : (
        <Card className="p-4">
          <ActionForm
            action={saveApplicationAction.bind(null, null)}
            submitLabel="Add application"
          >
            <ApplicationFields
              schools={schools}
              kids={children}
              defaultSchoolId={typeof school === "string" ? school : undefined}
              defaultYear={nextYear}
            />
          </ActionForm>
        </Card>
      )}
    </>
  );
}
