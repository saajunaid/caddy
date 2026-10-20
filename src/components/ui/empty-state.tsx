import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";

/** Explains what a section will show and how it gets filled. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="grid justify-items-start gap-3 p-5">
      <span className="grid size-10 place-items-center rounded-[10px] bg-sunk text-muted">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="text-[1.05rem] font-semibold">{title}</h2>
      <div className="max-w-[60ch] text-muted">{children}</div>
      {footer}
    </Card>
  );
}
