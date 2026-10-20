import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn(
        "rounded-[10px] border border-line bg-surface shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
