import type { RankingPeriod } from "@shared/coordination";
import type * as React from "react";
import { CrownStarIcon, FireIcon, StarIcon, UserPlusRoundedIcon } from "@solar-icons/react/bold-duotone";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { diceBearAvatarUrl, formatCount, formatFull, formatHelpDetail } from "@/lib/format";
import { cn } from "@/lib/utils";
import "./leaderboard-podium.css";

const medals = { 1: "gold", 2: "silver", 3: "bronze" } as const;

export type LeaderboardEntry = {
  id: string;
  name: string;
  points: number;
  /** GitHub login, shown as @handle. */
  handle: string;
  stars: number;
  activity?: number;
  upvotes?: number;
  period?: RankingPeriod;
  helpfulContributions?: number;
  starHelps?: number;
  helpedMembers?: number;
  currentStreak?: number;
  href: string;
  /** The member's GitHub avatar; DiceBear stands in when it's missing. */
  avatarUrl?: string;
  /** Stable string so the same person always gets the same face. */
  seed: string;
  avatarBg?: string;
  /** Replaces the stars line under the points chip (repos show forks there). */
  secondary?: { icon: React.ReactNode; value: number; label: string };
};

function PodiumSlot({
  entry,
  rank,
  blockHeight,
  isCurrentUser,
  flash,
  unit,
}: {
  unit: string;
  entry: LeaderboardEntry | null;
  rank: 1 | 2 | 3;
  blockHeight: string;
  isCurrentUser?: boolean;
  flash?: boolean;
}) {
  return (
    <div className="podium-slot flex min-w-0 flex-1 flex-col items-center" data-medal={entry ? medals[rank] : "empty"} id={entry ? `member-${entry.id}` : undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={entry?.id ?? `open-${rank}`}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={cn("relative mb-2 flex min-w-0 max-w-full flex-col items-center rounded-2xl px-1 pt-1 sm:mb-3 sm:px-1.5", flash && "animate-row-flash")}
        >
          {rank === 1 && (
            <CrownStarIcon size={24} className="podium-crown mb-1 sm:mb-1.5" aria-hidden />
          )}

          {entry ? (
            <>
              <a
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 max-w-full flex-col items-center"
                aria-label={`${entry.name}, rank ${rank}, ${formatFull(entry.points)} ${unit === "pts" ? "points" : unit}. Open on GitHub${isCurrentUser ? ". Your profile" : ""}`}
              >
                <Avatar
                  className="podium-avatar size-10 border-2 transition-transform group-hover:scale-105 sm:size-14"
                  data-current-user={isCurrentUser || undefined}
                >
                  <AvatarImage src={entry.avatarUrl ?? diceBearAvatarUrl(entry.seed, entry.avatarBg)} alt="" />
                  <AvatarFallback className="bg-alva-card text-xs font-medium text-foreground">
                    {entry.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <p className="mt-1.5 w-full max-w-[84px] truncate text-center text-xs font-medium text-foreground sm:max-w-[140px] sm:text-sm">
                  {entry.name}
                </p>
              </a>

              <span className="mt-1 max-w-full truncate rounded-full bg-alva-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular sm:mt-1.5 sm:px-2.5 sm:text-xs" title={`${formatFull(entry.points)} ${unit === "pts" ? "points" : unit}`}>
                <span className="sr-only">{formatFull(entry.points)} {unit === "pts" ? "points" : unit}</span>
                <span className="sm:hidden" aria-hidden="true">{formatCount(entry.points)} {unit}</span>
                <span className="hidden sm:inline" aria-hidden="true">{formatFull(entry.points)} {unit}</span>
              </span>
              {entry.helpfulContributions !== undefined && <span className="mt-1 max-w-full truncate text-[10px] text-t3 tabular sm:text-xs" title={formatHelpDetail(entry, entry.period)}>
                {formatCount(entry.helpfulContributions + (entry.starHelps ?? 0))} helps · {formatCount(entry.starHelps ?? 0)} stars given
              </span>}
              {(entry.currentStreak ?? 0) >= 2 && <span className="mt-0.5 inline-flex max-w-full items-center gap-0.5 text-[10px] text-t3 tabular sm:text-xs" title={`${formatFull(entry.currentStreak ?? 0)}-day activity streak`}>
                <FireIcon size={11} aria-hidden />
                {formatCount(entry.currentStreak ?? 0)}
                <span className="sr-only"> day activity streak</span>
              </span>}
              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-t3 tabular sm:mt-1 sm:text-xs">
                {entry.secondary?.icon ?? <StarIcon size={11} aria-hidden />}
                {formatCount(entry.secondary?.value ?? entry.stars)}
                <span className="sr-only"> {entry.secondary?.label ?? "stars"}</span>
              </span>
            </>
          ) : (
            <>
              <span className="flex size-10 items-center justify-center rounded-full bg-alva-surface text-t4 sm:size-14">
                <UserPlusRoundedIcon size={18} aria-hidden />
              </span>
              <p className="mt-2 text-xs font-medium text-t3 sm:text-sm">#{rank} open</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* The bar. 85% of the slot so the shortest one still reads as a block
          rather than a line, and the rank sits inside it rather than under it. */}
      <div className={cn("relative w-full", blockHeight)}>
        <div
          className="podium-bar absolute inset-x-0 bottom-0 h-[85%] overflow-hidden rounded-t-[16px] sm:rounded-t-[22px]"
        >
          {/* Top lip. Catches light on the leading edge so the bar reads as a
              solid with a top face, not a flat rectangle. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/70 to-transparent"
          />

          <span className="podium-rank absolute inset-x-0 top-3 flex sm:top-5 justify-center text-2xl font-bold sm:text-4xl" aria-hidden>
            {rank}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Second, first, third — in that order on screen.
 *
 * The winner is centre and tallest, which is the shape everyone already reads
 * without a legend. Ranking them 1-2-3 left to right would be a list, and a
 * list does not need a podium.
 *
 * `entries` is in rank order; missing places render as open slots so the
 * podium keeps its shape before three people have joined.
 */
export function LeaderboardPodium({
  entries,
  currentUserId,
  flashId,
  unit = "pts",
  ariaLabel = "Top three",
  className,
}: {
  /** What `points` counts, e.g. "pts" or "stars". */
  unit?: string;
  ariaLabel?: string;
  entries: LeaderboardEntry[];
  currentUserId?: string | null;
  flashId?: string | null;
  className?: string;
}) {
  const [first = null, second = null, third = null] = entries;

  return (
    <div className={cn("relative", className)} role="list" aria-label={ariaLabel}>
      {/* Fades the bars into the page bottom, so they look like they continue
          past the edge rather than being cut off by it. A mask rather than a
          colour overlay, so it blends into the gradient backdrop too. */}
      <div className="relative flex items-end justify-center gap-1.5 px-1 [mask-image:linear-gradient(to_bottom,#000_calc(100%-56px),transparent)] sm:gap-3 sm:[mask-image:linear-gradient(to_bottom,#000_calc(100%-90px),transparent)]">
        {([
          [second, 2, "h-[110px] sm:h-[220px]"],
          [first, 1, "h-[150px] sm:h-[300px]"],
          [third, 3, "h-[80px] sm:h-[165px]"],
        ] as const).map(([entry, rank, height]) => (
          <div key={rank} role="listitem" className="flex min-w-0 flex-1">
            <PodiumSlot
              entry={entry}
              rank={rank}
              blockHeight={height}
              isCurrentUser={!!entry && entry.id === currentUserId}
              flash={!!entry && entry.id === flashId}
              unit={unit}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
