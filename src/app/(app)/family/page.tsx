import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Family" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Week · tasks · lists" title="Family" />
      <EmptyState icon={Users} title="Nothing planned yet">
        Your shared week, tasks, shopping lists and school places will live
        here, with a calendar feed for Apple or Google Calendar and Share to
        WhatsApp on any list.
      </EmptyState>
    </>
  );
}
