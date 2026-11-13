import type { ComponentProps } from "react";
import { AltArrowDownIcon } from "@solar-icons/react/linear";
import { cn } from "@/lib/utils";

export function DisclosureSummary({ children, className, ...props }: ComponentProps<"summary">) {
  return <summary {...props} className={cn("disclosure-summary flex min-h-11 min-w-0 cursor-pointer list-none items-center gap-2 rounded-sm py-2 [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-foreground/40", className)}>
    {children}
    <AltArrowDownIcon className="disclosure-chevron ml-auto size-4 shrink-0 text-t3 motion-safe:transition-transform" aria-hidden />
  </summary>;
}
