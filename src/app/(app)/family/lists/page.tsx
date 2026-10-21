import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { createListAction } from "@/modules/family/actions";
import { ActionForm } from "@/modules/family/components/action-form";
import { Field, KIND_LABELS } from "@/modules/family/components/forms";
import { BackLink, NoHousehold } from "@/modules/family/components/page-bits";
import { buttonClass, inputClass } from "@/modules/family/components/ui";
import { loadLists } from "@/modules/family/queries";
import { LIST_KINDS } from "@/modules/family/schemas";

export const metadata = { title: "Lists" };

export default async function ListsPage() {
  const { profile } = await requireHousehold();
  if (!profile) return <NoHousehold />;
  const lists = await loadLists(profile.householdId);
  return (
    <>
      <BackLink href="/family">Family</BackLink>
      <PageHeader eyebrow="Family" title="Lists" />
      <Card className="divide-y divide-line">
        {lists.map((list) => {
          const open = list.items.filter((i) => !i.checked).length;
          return (
            <Link
              key={list.id}
              href={`/family/lists/${list.id}`}
              className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-fg/4"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold wrap-anywhere">
                  {list.name}
                </span>
                <span className="block text-sm text-muted">
                  {KIND_LABELS[list.kind] ?? list.kind} ·{" "}
                  <span className="num">{open}</span> to get
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-muted" />
            </Link>
          );
        })}
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 text-[1.05rem] font-semibold">New list</h2>
        <ActionForm
          action={createListAction}
          submitLabel="Create list"
          submitClassName={buttonClass}
        >
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field id="list-name" label="Name">
              <input
                id="list-name"
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Holiday packing"
                className={inputClass}
              />
            </Field>
            <Field id="list-kind" label="Kind">
              <select
                id="list-kind"
                name="kind"
                defaultValue="other"
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
    </>
  );
}
