import { Plane } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Travel" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Trip planner" title="Travel" />
      <EmptyState icon={Plane} title="No trips yet">
        Create a trip brief, add the flight and hotel options you find, and
        Caddy totals the whole-family cost so you can compare like for like. It
        never books anything.
      </EmptyState>
    </>
  );
}
