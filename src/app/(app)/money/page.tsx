import { Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Money" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Bills · tax evidence · contracts" title="Money" />
      <EmptyState icon={Wallet} title="No bills yet">
        Add a bill once and Caddy reads it, asks you to confirm the details, and
        uses it for household spending, utility comparisons and your remote
        working relief evidence.
      </EmptyState>
      <p className="mt-6 text-sm">
        <Link href="/money/utilities" className="text-info underline">
          Utility contracts and comparisons
        </Link>
      </p>
    </>
  );
}
