import { FireIcon } from "@solar-icons/react/bold-duotone";
import { ACHIEVEMENTS, type AchievementId, type MemberProgression } from "@shared/progression";
import { formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACHIEVEMENT_ICONS } from "./achievement-icons";
import { ActivityHeatmap } from "./activity-heatmap";

function earnedOn(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Earned badges, verified activity and the next goals. Styled with the
 * surrounding text colour so it reads the same on the board and on a
 * portfolio whose theme is independent of the app's.
 */
export function ProgressionPanel({ progression, className }: { progression: MemberProgression; className?: string }) {
  const earned = (Object.entries(progression.achievements) as [AchievementId, number][])
    .filter(([id]) => id in ACHIEVEMENTS)
    .sort((a, b) => b[1] - a[1]);
  const goals = progression.goals.slice(0, 4);

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular">
          <FireIcon size={16} aria-hidden />
          {formatFull(progression.currentStreak)}
          <span className="font-normal opacity-60">day streak</span>
        </span>
        <span className="text-xs opacity-60 tabular">Longest {formatFull(progression.longestStreak)} days</span>
      </div>

      <ActivityHeatmap days={progression.activityDays} />

      <div>
        <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] opacity-55">Earned</h4>
        {earned.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">No milestones yet. Stay active to earn the first one.</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {earned.map(([id, at]) => {
              const Icon = ACHIEVEMENT_ICONS[id];
              return (
                <li key={id} className="flex items-center gap-2.5 rounded-xl bg-[color-mix(in_srgb,currentColor_6%,transparent)] px-3 py-2">
                  <Icon size={18} className="shrink-0 opacity-80" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{ACHIEVEMENTS[id].label}</span>
                    <span className="block text-[11px] opacity-55 tabular">{earnedOn(at)} · {formatFull(progression.counts[id] ?? 0)} of {formatFull(progression.total)} members</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {goals.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] opacity-55">Next up</h4>
          <ul className="mt-2 space-y-1.5">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs opacity-70">{goal.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)]">
                  <span className="block h-full rounded-full bg-[color-mix(in_srgb,currentColor_45%,transparent)]" style={{ width: `${Math.round((goal.current / goal.target) * 100)}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right text-[11px] opacity-55 tabular">{formatFull(goal.current)}/{formatFull(goal.target)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
