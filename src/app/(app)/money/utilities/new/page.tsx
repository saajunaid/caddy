import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireHousehold } from "@/server/auth";
import { createContractAction } from "@/modules/money/utilities/actions";
import { ContractForm } from "@/modules/money/utilities/components/contract-form";

export const metadata = { title: "Add a utility contract" };

export default async function NewContractPage() {
  const { profile } = await requireHousehold();
  return (
    <>
      <div className="grid gap-1">
        <Link
          href="/money/utilities"
          className="inline-flex items-center gap-1 text-sm text-info hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Utilities
        </Link>
        <h2 className="text-[1.25rem] leading-tight font-bold">
          Add a contract
        </h2>
      </div>
      <Card className="p-4">
        {profile ? (
          <ContractForm
            action={createContractAction}
            submitLabel="Add contract"
          />
        ) : (
          <p className="text-muted">
            Your account isn&apos;t part of a household yet.
          </p>
        )}
      </Card>
    </>
  );
}
