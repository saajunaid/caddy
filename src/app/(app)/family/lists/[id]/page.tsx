import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteListAction, updateListAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { ConfirmButton } from "@/modules/family/components/controls";
import { Field, KIND_LABELS } from "@/modules/family/components/forms";
import { ListPanel } from "@/modules/family/components/list-panel";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import {
  buttonClass,
  dangerButtonClass,
  inputClass,
} from "@/modules/family/components/ui";
import { loadLists } from "@/modules/family/queries";
import { LIST_KINDS } from "@/modules/family/schemas";

export const metadata = { title: "List" };

export default async function ListPage({
  params,
}: PageProps<"/family/lists/[id]">) {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const { id } = await params;
  const lists = await loadLists(profile.householdId);
  const list = lists.find((l) => l.id === id);
  if (!list) notFound();

  return (
    <>
      <BackLink href="/family/lists">Lists</BackLink>
      <PageHeader
        eyebrow={KIND_LABELS[list.kind] ?? "List"}
        title={list.name}
      />
      <Card>
        <ListPanel
          list={list}
          editable
          heading={<h2 className="sr-only">Items</h2>}
        />
      </Card>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-info">
          Rename or delete this list
        </summary>
        <Card className="mt-2.5 p-4">
          <ActionForm
            action={updateListAction.bind(null, list.id)}
            submitLabel="Save"
            submitClassName={buttonClass}
            footer={
              <ConfirmButton
                action={deleteListAction.bind(null, list.id)}
                confirm={`Delete “${list.name}” and everything on it?`}
                className={dangerButtonClass}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete list
              </ConfirmButton>
            }
          >
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Field id="list-name" label="Name">
                <input
                  id="list-name"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={list.name}
                  className={inputClass}
                />
              </Field>
              <Field id="list-kind" label="Kind">
                <select
                  id="list-kind"
                  name="kind"
                  defaultValue={list.kind}
                  className={inputClass}
                >
                  {LIST_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </details>
    </>
  );
}
