import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Inbox" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Alerts" title="Inbox" />
      <EmptyState icon={Bell} title="No alerts yet">
        New matching homes, deadlines, bills to review and failed background
        checks will arrive here, and on your phone once notifications are
        switched on.
      </EmptyState>
    </>
  );
}
