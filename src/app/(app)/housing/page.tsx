import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Housing" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Cost Rental Watch" title="Housing" />
      <EmptyState icon={Building2} title="No listings yet">
        Every morning Caddy will check newstarterhomes.ie for 3-bed houses and
        4-bed homes of any type, keep their history, and show nearby childcare,
        schools, colleges, bus stops, mosques and halal food for each one.
      </EmptyState>
    </>
  );
}
