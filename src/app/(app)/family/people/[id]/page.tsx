import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import {
  removePersonAction,
  updatePersonAction,
} from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ConfirmButton } from "@/modules/family/components/controls";
import { PersonFields } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { dangerButtonClass } from "@/modules/family/components/ui";
import { loadMembers } from "@/modules/family/queries";
import { dublinDate } from "@/modules/family/server/time.ts";

export const metadata = { title: "Person" };

export default async function PersonPage({
  params,
}: PageProps<"/family/people/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  const members = await loadMembers();
  const member = members.find((m) => m.id === id);
  if (!member) notFound();
  const today = dublinDate(new Date());

  return (
    <>
      <BackLink href="/family#people">Family</BackLink>
      <PageHeader
        eyebrow={member.relationship === "child" ? "Child" : "Adult"}
        title={member.name}
      />
      <Card className="p-4">
        <ActionForm
          action={updatePersonAction.bind(null, member.id)}
          submitLabel="Save"
          footer={
            member.hasLogin ? null : (
              <ConfirmButton
                action={removePersonAction.bind(null, member.id)}
                confirm={`Remove ${member.name}? Their school applications are removed too, and their tasks become unassigned.`}
                className={dangerButtonClass}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Remove
              </ConfirmButton>
            )
          }
        >
          <PersonFields member={member} today={today} />
          {member.hasLogin ? (
            <p className="text-sm text-muted">
              {member.name} signs in to Caddy, so their name is managed in
              Settings.
            </p>
          ) : null}
        </ActionForm>
      </Card>
    </>
  );
}
