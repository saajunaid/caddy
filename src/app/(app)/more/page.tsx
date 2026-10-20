import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NAV_ITEMS } from "@/modules/nav";

export const metadata = { title: "More" };

export default function MorePage() {
  const items = NAV_ITEMS.filter((item) => !item.phone);
  return (
    <>
      <PageHeader title="More" />
      <Card className="divide-y divide-line">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-fg/4"
            >
              <Icon
                aria-hidden="true"
                className="size-[22px] shrink-0 text-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{item.label}</span>
                <span className="block text-sm text-muted">
                  {item.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </Link>
          );
        })}
      </Card>
    </>
  );
}
