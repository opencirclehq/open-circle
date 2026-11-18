const DAY_MS = 86_400_000;

/** How much verified daily history one member record keeps. */
export const ACTIVITY_HISTORY_DAYS = 400;

/** Window, in UTC days, used to judge consistent (not necessarily consecutive) activity. */
export const CONSISTENCY_WINDOW_DAYS = 30;

/** Active days within the window that earn the consistency achievement. */
export const CONSISTENCY_TARGET_DAYS = 20;

export type AchievementGroup = "activity" | "streak" | "help" | "craft" | "audience";

/** The verified signal an achievement is measured against. */
export type AchievementMetric =
  | "contributions"
  | "longestStreak"
  | "helpedMembers"
  | "reviews"
  | "issues"
  | "stars"
  | "followers"
  | "activeDays"
  | "portfolio";

export interface AchievementDef {
  group: AchievementGroup;
  metric: AchievementMetric;
  target: number;
  label: string;
}

/**
 * Every achievement, its verified metric and the threshold that earns it.
 * Thresholds are the product's taste; the numbers are intentionally round so
 * they are easy to reason about and to explain on the board.
 */
export const ACHIEVEMENTS = {
  first_contribution: { group: "activity", metric: "contributions", target: 1, label: "First verified contribution" },
  prolific_contributor: { group: "activity", metric: "contributions", target: 250, label: "250 public contributions" },
  consistent_20_30: { group: "activity", metric: "activeDays", target: CONSISTENCY_TARGET_DAYS, label: "Active 20 of the last 30 days" },
  streak_7: { group: "streak", metric: "longestStreak", target: 7, label: "Seven-day streak" },
  streak_30: { group: "streak", metric: "longestStreak", target: 30, label: "Thirty-day streak" },
  streak_100: { group: "streak", metric: "longestStreak", target: 100, label: "Hundred-day streak" },
  streak_365: { group: "streak", metric: "longestStreak", target: 365, label: "Year-long streak" },
  first_help: { group: "help", metric: "helpedMembers", target: 1, label: "First confirmed help" },
  community_helper_5: { group: "help", metric: "helpedMembers", target: 5, label: "Helped five members" },
  community_helper_25: { group: "help", metric: "helpedMembers", target: 25, label: "Helped twenty-five members" },
  first_review: { group: "craft", metric: "reviews", target: 1, label: "First code review" },
  issue_hunter: { group: "craft", metric: "issues", target: 10, label: "Ten issues opened" },
  portfolio_author: { group: "craft", metric: "portfolio", target: 1, label: "Published a portfolio" },
  stars_100: { group: "audience", metric: "stars", target: 100, label: "100 stars across projects" },
  followers_100: { group: "audience", metric: "followers", target: 100, label: "100 followers" },
} as const satisfies Record<string, AchievementDef>;

export type AchievementId = keyof typeof ACHIEVEMENTS;

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export interface Streaks {
  current: number;
  longest: number;
  /** First UTC day of the current run; "" when the streak is not alive. */
  start: string;
}

export function isUtcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** The UTC calendar day (YYYY-MM-DD) a timestamp falls on. */
export function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Valid, de-duplicated days in order, oldest first. */
export function normalizeDays(days: readonly string[] = []): string[] {
  return [...new Set(days.filter(isUtcDay))].sort();
}

/** Unions day sets and keeps only the most recent `cap` days. */
export function mergeActivityDays(
  existing: readonly string[] = [],
  incoming: readonly string[] = [],
  cap = ACTIVITY_HISTORY_DAYS,
): string[] {
  const merged = new Set<string>();
  for (const day of existing) if (isUtcDay(day)) merged.add(day);
  for (const day of incoming) if (isUtcDay(day)) merged.add(day);
  return [...merged].sort().slice(-cap);
}

/**
 * `longest` is the running maximum, floored by any already-recorded value so
 * trimming old history never shrinks it. `current` counts consecutive UTC days
 * ending today, or yesterday when today has no activity yet.
 *
 * `startFloor` is the first day of the streak counted last time. History is
 * trimmed to `ACTIVITY_HISTORY_DAYS`, so a longer ongoing run loses its oldest
 * days; carrying the floor lets the run keep growing past the trim instead of
 * freezing at the cap. It is only honoured while the run is still alive.
 */
export function computeStreaks(days: readonly string[], today: string, longestFloor = 0, startFloor = ""): Streaks {
  const ordered = normalizeDays(days);
  let longest = Number.isSafeInteger(longestFloor) && longestFloor > 0 ? longestFloor : 0;
  let run = 0;
  let last = 0;
  let runStart = "";
  for (const day of ordered) {
    const at = dayStart(day);
    if (last > 0 && at - last === DAY_MS) run += 1;
    else {
      run = 1;
      runStart = day;
    }
    last = at;
    if (run > longest) longest = run;
  }
  const alive = isUtcDay(today) && last >= dayStart(today) - DAY_MS;
  if (!alive) return { current: 0, longest, start: "" };
  let current = run;
  let start = runStart;
  // Only a run that reaches the trim boundary can have lost older days, so the
  // floor is applied just there — never across a gap the retained days reveal.
  if (ordered.length >= ACTIVITY_HISTORY_DAYS && runStart === ordered[0] && isUtcDay(startFloor) && dayStart(startFloor) < dayStart(runStart)) {
    current = run + Math.round((dayStart(runStart) - dayStart(startFloor)) / DAY_MS);
    start = startFloor;
  }
  if (current > longest) longest = current;
  return { current, longest, start };
}

/** Verified activity days that fall inside the window ending on `today`. */
export function activeDaysInWindow(days: readonly string[], today: string, window = CONSISTENCY_WINDOW_DAYS): number {
  if (!isUtcDay(today)) return 0;
  const end = dayStart(today);
  const start = end - (window - 1) * DAY_MS;
  return normalizeDays(days).filter((day) => {
    const at = dayStart(day);
    return at >= start && at <= end;
  }).length;
}

export interface ProgressionSignals {
  activityDays: readonly string[];
  longestStreak: number;
  /** Public contributions (commits, PRs, reviews, issues, new repos) since joining. */
  contributions?: number;
  helpfulContributions?: number;
  helpedMembers?: number;
  reviews?: number;
  issues?: number;
  stars?: number;
  followers?: number;
  hasPortfolio?: boolean;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The verified value of a metric. Never trusts bad stored numbers. */
export function metricValue(signals: ProgressionSignals, metric: AchievementMetric, today: string): number {
  switch (metric) {
    case "contributions":
      return Math.max(count(signals.contributions), normalizeDays(signals.activityDays).length);
    case "longestStreak":
      return count(signals.longestStreak);
    case "helpedMembers":
      return count(signals.helpedMembers);
    case "reviews":
      return count(signals.reviews);
    case "issues":
      return count(signals.issues);
    case "stars":
      return count(signals.stars);
    case "followers":
      return count(signals.followers);
    case "activeDays":
      return activeDaysInWindow(signals.activityDays, today);
    case "portfolio":
      return signals.hasPortfolio ? 1 : 0;
  }
}

function sanitize(existing: Record<string, number> = {}): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [id, at] of Object.entries(existing)) {
    if (id in ACHIEVEMENTS && Number.isSafeInteger(at)) merged[id] = at;
  }
  return merged;
}

/** Adds newly-earned achievements to the existing set without re-awarding. */
export function evaluateAchievements(
  signals: ProgressionSignals,
  existing: Record<string, number> = {},
  now = Date.now(),
): Record<string, number> {
  const merged = sanitize(existing);
  const today = utcDay(now);
  for (const id of ACHIEVEMENT_IDS) {
    if (id in merged) continue;
    const def = ACHIEVEMENTS[id];
    if (metricValue(signals, def.metric, today) >= def.target) merged[id] = now;
  }
  return merged;
}

export interface AchievementProgress {
  id: AchievementId;
  group: AchievementGroup;
  label: string;
  current: number;
  target: number;
}

/**
 * The closest unearned goal in each group, so the UI can show "next up"
 * progress such as "4/7 days" without inventing numbers.
 */
export function nextGoals(
  signals: ProgressionSignals,
  existing: Record<string, number> = {},
  now = Date.now(),
): AchievementProgress[] {
  const earned = sanitize(existing);
  const today = utcDay(now);
  const byGroup = new Map<AchievementGroup, AchievementProgress>();
  for (const id of ACHIEVEMENT_IDS) {
    if (id in earned) continue;
    const def = ACHIEVEMENTS[id];
    const current = Math.min(metricValue(signals, def.metric, today), def.target);
    const held = byGroup.get(def.group);
    const ratio = current / def.target;
    const heldRatio = held ? held.current / held.target : -1;
    if (!held || ratio > heldRatio || (ratio === heldRatio && def.target < held.target))
      byGroup.set(def.group, { id, group: def.group, label: def.label, current, target: def.target });
  }
  return [...byGroup.values()].sort((a, b) => b.current / b.target - a.current / a.target);
}

/** The next streak length that earns a milestone, or null when all are earned. */
export function nextStreakMilestone(longestStreak: number): number | null {
  const targets = ACHIEVEMENT_IDS
    .map((id) => ACHIEVEMENTS[id])
    .filter((def) => def.metric === "longestStreak")
    .map((def) => def.target)
    .sort((a, b) => a - b);
  return targets.find((target) => target > longestStreak) ?? null;
}

/** One member's progression, as returned by the on-demand progression endpoint. */
export interface MemberProgression {
  login: string;
  nickname: string;
  currentStreak: number;
  longestStreak: number;
  /** Earned achievement ids mapped to the award time (ms). */
  achievements: Record<string, number>;
  /** Verified UTC activity days, oldest first. */
  activityDays: string[];
  /** Achievement id → how many members earned it. */
  counts: Record<string, number>;
  /** Visible members the counts are drawn from. */
  total: number;
  /** The closest unearned goal in each group. */
  goals: AchievementProgress[];
}

export function sameAchievements(a: Record<string, number> = {}, b: Record<string, number> = {}): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
