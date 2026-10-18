import { FireIcon } from "@solar-icons/react/bold-duotone";
import type { PublicMember } from "@shared/types";
import { ACHIEVEMENTS, nextStreakMilestone, type AchievementId } from "@shared/progression";
import { formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACHIEVEMENT_ICONS } from "./achievement-icons";

const MAX_BADGES = 3;

type Progression = Pick<PublicMember, "currentStreak" | "longestStreak" | "achievements">;

function rarity(id: AchievementId, counts?: Record<string, number>, total?: number): string {
  if (!counts || !total) return "";
  return ` · earned by ${formatFull(counts[id] ?? 0)} of ${formatFull(total)} members`;
}

export function ProgressionBadges({
  member,
  counts,
  total,
  className,
}: {
  member: Progression;
  /** Achievement id → number of members who earned it, for rarity hints. */
  counts?: Record<string, number>;
  total?: number;
  className?: string;
}) {
  const streak = member.currentStreak ?? 0;
  const longest = member.longestStreak ?? 0;
  const earned = (member.achievements ?? []).filter((id): id is AchievementId => id in ACHIEVEMENTS);
  if (streak < 2 && earned.length === 0) return null;

  const next = nextStreakMilestone(longest);
  const streakTitle = [
    `Current streak ${formatFull(streak)} ${streak === 1 ? "day" : "days"}`,
    `longest ${formatFull(longest)}`,
    next ? `next milestone ${formatFull(next)}` : "all streak milestones earned",
  ].join(" · ");

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {streak >= 2 && (
        <span className="inline-flex items-center gap-0.5 text-[11px] tabular text-t3" title={streakTitle}>
          <FireIcon size={12} aria-hidden />
          {streak}
          <span className="sr-only"> day activity streak. {streakTitle}</span>
        </span>
      )}
      {earned.length > 0 && (
        <span className="hidden items-center gap-1 md:inline-flex">
          {earned.slice(0, MAX_BADGES).map((id) => {
            const Icon = ACHIEVEMENT_ICONS[id];
            const title = `${ACHIEVEMENTS[id].label}${rarity(id, counts, total)}`;
            return (
              <span key={id} className="inline-flex text-t4" title={title}>
                <Icon size={12} aria-hidden />
                <span className="sr-only">{title}</span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
