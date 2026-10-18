import { describe, expect, it } from "vitest";
import {
  ACTIVITY_HISTORY_DAYS,
  activeDaysInWindow,
  computeStreaks,
  evaluateAchievements,
  isUtcDay,
  mergeActivityDays,
  nextGoals,
  nextStreakMilestone,
  normalizeDays,
  sameAchievements,
  utcDay,
} from "../shared/progression";

describe("UTC day helpers", () => {
  it("accepts only real calendar days", () => {
    expect(isUtcDay("2026-10-14")).toBe(true);
    expect(isUtcDay("2026-02-29")).toBe(false);
    expect(isUtcDay("2024-02-29")).toBe(true);
    expect(isUtcDay("2026-2-4")).toBe(false);
    expect(isUtcDay("nope")).toBe(false);
    expect(isUtcDay(20261014)).toBe(false);
    expect(isUtcDay(null)).toBe(false);
  });

  it("maps a timestamp to its UTC calendar day", () => {
    expect(utcDay(Date.parse("2026-10-14T23:59:59.000Z"))).toBe("2026-10-14");
    expect(utcDay(Date.parse("2026-10-15T00:00:00.000Z"))).toBe("2026-10-15");
  });
});

describe("activity day sets", () => {
  it("drops invalid entries and de-duplicates in order", () => {
    expect(normalizeDays(["2026-10-14", "2026-10-12", "2026-10-14", "bad"])).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("unions sets and keeps only the most recent days", () => {
    expect(mergeActivityDays(["2026-10-12", "2026-10-13"], ["2026-10-13", "2026-10-14"])).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
    expect(mergeActivityDays(["2026-10-01", "2026-10-02", "2026-10-03"], ["2026-10-04"], 2)).toEqual([
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("streak calculation", () => {
  const today = "2026-10-14";

  it("returns no streak without activity", () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0, start: "" });
  });

  it("counts consecutive days ending today", () => {
    expect(computeStreaks(["2026-10-12", "2026-10-13", "2026-10-14"], today)).toEqual({ current: 3, longest: 3, start: "2026-10-12" });
  });

  it("keeps yesterday's run alive until today is missed", () => {
    expect(computeStreaks(["2026-10-11", "2026-10-12", "2026-10-13"], today)).toEqual({ current: 3, longest: 3, start: "2026-10-11" });
  });

  it("breaks the current streak after a missed day but remembers the longest", () => {
    expect(computeStreaks(["2026-10-10", "2026-10-11", "2026-10-13", "2026-10-14"], today)).toEqual({ current: 2, longest: 2, start: "2026-10-13" });
    expect(computeStreaks(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"], today)).toEqual({ current: 0, longest: 4, start: "" });
  });

  it("treats UTC days as consecutive across a daylight-saving change", () => {
    expect(computeStreaks(["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09")).toEqual({ current: 3, longest: 3, start: "2026-03-07" });
  });

  it("never lets trimming old history shrink the longest streak", () => {
    expect(computeStreaks(["2026-10-13", "2026-10-14"], today, 12)).toEqual({ current: 2, longest: 12, start: "2026-10-13" });
  });

  it("keeps an ongoing run growing past the history trim", () => {
    const end = Date.parse(`${today}T00:00:00Z`);
    const full = Array.from({ length: ACTIVITY_HISTORY_DAYS + 1 }, (_, i) => utcDay(end - (ACTIVITY_HISTORY_DAYS - i) * 86_400_000));
    const trimmed = full.slice(-ACTIVITY_HISTORY_DAYS);
    expect(computeStreaks(trimmed, today)).toEqual({ current: ACTIVITY_HISTORY_DAYS, longest: ACTIVITY_HISTORY_DAYS, start: trimmed[0] });
    expect(computeStreaks(trimmed, today, ACTIVITY_HISTORY_DAYS, full[0])).toEqual({ current: ACTIVITY_HISTORY_DAYS + 1, longest: ACTIVITY_HISTORY_DAYS + 1, start: full[0] });
  });

  it("ignores a stored start that a gap has already broken", () => {
    expect(computeStreaks(["2026-10-14"], today, 0, "2020-01-01")).toEqual({ current: 1, longest: 1, start: "2026-10-14" });
  });
});

describe("achievement evaluation", () => {
  it("awards milestones from verified signals", () => {
    const earned = evaluateAchievements(
      { activityDays: ["2026-10-14"], longestStreak: 7, helpedMembers: 5 },
      {},
      1000,
    );
    expect(earned).toEqual({
      first_contribution: 1000,
      streak_7: 1000,
      first_help: 1000,
      community_helper_5: 1000,
    });
  });

  it("awards the extended tiers from their own verified metrics", () => {
    const earned = evaluateAchievements(
      { activityDays: [], longestStreak: 400, contributions: 300, helpedMembers: 25, reviews: 1, issues: 10, stars: 100, followers: 100, hasPortfolio: true },
      {},
      2000,
    );
    expect(earned).toEqual(expect.objectContaining({
      prolific_contributor: 2000,
      streak_100: 2000,
      streak_365: 2000,
      community_helper_25: 2000,
      first_review: 2000,
      issue_hunter: 2000,
      stars_100: 2000,
      followers_100: 2000,
      portfolio_author: 2000,
    }));
  });

  it("awards consistency from non-consecutive active days in the window", () => {
    const scattered = ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07", "2026-10-09", "2026-10-11", "2026-10-13", "2026-10-14"];
    expect(evaluateAchievements({ activityDays: scattered, longestStreak: 2 }, {}, Date.parse("2026-10-14T12:00:00Z")).consistent_20_30).toBeUndefined();
    const end = Date.parse("2026-10-14T00:00:00Z");
    const twenty = Array.from({ length: 20 }, (_, i) => utcDay(end - i * 86_400_000));
    expect(evaluateAchievements({ activityDays: twenty, longestStreak: 1 }, {}, end + 12 * 3_600_000).consistent_20_30).toBe(end + 12 * 3_600_000);
  });

  it("requires the full streak length and help counts", () => {
    expect(evaluateAchievements({ activityDays: ["2026-10-14"], longestStreak: 6 }, {}, 5)).toEqual({ first_contribution: 5 });
    expect(evaluateAchievements({ activityDays: [], longestStreak: 0 }, {}, 5)).toEqual({});
  });

  it("does not re-award an achievement or move its timestamp", () => {
    const again = evaluateAchievements({ activityDays: ["2026-10-14"], longestStreak: 30 }, { first_contribution: 111 }, 999);
    expect(again.first_contribution).toBe(111);
    expect(again.streak_7).toBe(999);
    expect(again.streak_30).toBe(999);
  });

  it("ignores unknown achievement ids in stored state", () => {
    expect(evaluateAchievements({ activityDays: [], longestStreak: 0 }, { mystery: 1 }, 7)).toEqual({});
  });

  it("points at the next streak milestone or none once all are earned", () => {
    expect(nextStreakMilestone(0)).toBe(7);
    expect(nextStreakMilestone(7)).toBe(30);
    expect(nextStreakMilestone(200)).toBe(365);
    expect(nextStreakMilestone(365)).toBeNull();
  });

  it("compares achievement maps structurally", () => {
    expect(sameAchievements({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameAchievements({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameAchievements({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameAchievements()).toBe(true);
  });
});

describe("consistency window", () => {
  it("counts only days inside the trailing window", () => {
    const days = ["2026-08-01", "2026-09-15", "2026-09-20", "2026-10-14"];
    expect(activeDaysInWindow(days, "2026-10-14", 30)).toBe(3);
    expect(activeDaysInWindow(days, "2026-10-14", 7)).toBe(1);
    expect(activeDaysInWindow(days, "not-a-day", 30)).toBe(0);
  });
});

describe("next-goal progress", () => {
  it("returns the closest unearned goal per group with a capped current value", () => {
    const goals = nextGoals(
      { activityDays: ["2026-10-12", "2026-10-13", "2026-10-14"], longestStreak: 4, contributions: 3, helpedMembers: 2, stars: 40 },
      { first_contribution: 1, first_help: 1 },
    );
    const streak = goals.find((goal) => goal.group === "streak");
    expect(streak).toMatchObject({ id: "streak_7", current: 4, target: 7 });
    const help = goals.find((goal) => goal.group === "help");
    expect(help).toMatchObject({ id: "community_helper_5", current: 2, target: 5 });
    const activity = goals.find((goal) => goal.group === "activity");
    expect(activity).toMatchObject({ id: "consistent_20_30", current: 3, target: 20 });
    expect(goals.some((goal) => goal.id === "first_contribution")).toBe(false);
  });
});
