import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/**
 * A GitHub-style grid of verified activity days, one column per week, Sunday
 * first. Cells are decorative; the figure reads as a single labelled image.
 */
export function ActivityHeatmap({
  days,
  weeks = 26,
  today,
  className,
}: {
  days: readonly string[];
  weeks?: number;
  /** The UTC day to anchor the grid to; defaults to the current UTC day. */
  today?: string;
  className?: string;
}) {
  const active = new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)));
  const fallback = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };
  const anchor = today && Number.isFinite(dayToMs(today)) ? dayToMs(today) : fallback();
  const start = anchor - new Date(anchor).getUTCDay() * DAY_MS - (weeks - 1) * 7 * DAY_MS;
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const ts = start + i * DAY_MS;
    const day = new Date(ts).toISOString().slice(0, 10);
    return { day, active: active.has(day), future: ts > anchor };
  });
  const activeCount = cells.filter((cell) => cell.active).length;

  return (
    <div
      role="img"
      aria-label={`${activeCount} active ${activeCount === 1 ? "day" : "days"} in the last ${weeks * 7} days`}
      className={cn("grid grid-flow-col grid-rows-[repeat(7,0.625rem)] gap-[3px]", className)}
    >
      {cells.map((cell) => (
        <span
          key={cell.day}
          aria-hidden
          title={cell.active ? `Active on ${cell.day}` : undefined}
          className={cn(
            "size-2.5 rounded-[3px]",
            cell.future
              ? "opacity-0"
              : cell.active
                ? "bg-[color-mix(in_srgb,currentColor_72%,transparent)]"
                : "bg-[color-mix(in_srgb,currentColor_10%,transparent)]",
          )}
        />
      ))}
    </div>
  );
}
