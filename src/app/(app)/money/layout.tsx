import { PageHeader } from "@/components/ui/page-header";
import { MoneyTabs } from "./money-tabs";

/**
 * Shared shell for Money: one header and the Bills · Tax · Utilities tabs.
 * Pages below render their own content only (no second page title).
 */
export default function MoneyLayout({ children }: LayoutProps<"/money">) {
  return (
    <>
      <div className="grid gap-3 print:hidden">
        <PageHeader eyebrow="Bills · tax evidence · contracts" title="Money" />
        <MoneyTabs />
      </div>
      {children}
    </>
  );
}
