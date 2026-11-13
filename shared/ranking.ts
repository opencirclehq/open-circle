import type { Weights } from "./types.js";
import { HELPER_POLICY } from "./coordination.js";

export const DEFAULT_WEIGHTS: Weights = {
  stars: 5,
  followers: 4,
  repos: 1,
  reposCap: 50,
  activity: 1,
  upvotes: 1,
};

interface Scorable {
  stars: number;
  followers: number;
  repos: number;
  activity: number;
  upvotes?: number;
}

export function scoreOf(s: Scorable, w: Weights): number {
  return (
    s.stars * w.stars +
    s.followers * w.followers +
    Math.min(s.repos, w.reposCap) * w.repos +
    s.activity * w.activity +
    (s.upvotes ?? 0) * w.upvotes
  );
}

export function contributionStart(joinedAt: number): number {
  const day = new Date(joinedAt);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

export function communityScore(githubScore: number, helperPoints = 0, communityPoints = 0): number {
  return Math.max(0, helperPoints) + Math.max(0, communityPoints) + Math.min(HELPER_POLICY.reputationCap, Math.max(0, githubScore));
}

interface Standing {
  score: number;
  stars: number;
  createdAt: number;
  helpedMembers?: number;
  githubScore?: number;
  helperPoints?: number;
}

/** Higher score first; ties favour helping more members, then GitHub reputation and joining order. */
export function compareStanding(a: Standing, b: Standing): number {
  return b.score - a.score || (b.helperPoints ?? 0) - (a.helperPoints ?? 0) || (b.helpedMembers ?? 0) - (a.helpedMembers ?? 0) || (b.githubScore ?? 0) - (a.githubScore ?? 0) || b.stars - a.stars || a.createdAt - b.createdAt;
}

/**
 * Where a newcomer would land today. Existing members win otherwise equal ties.
 */
export function projectedRank(
  candidate: Omit<Standing, "createdAt">,
  members: ReadonlyArray<Omit<Standing, "createdAt">>,
): number {
  const ahead = members.filter(
    (m) => compareStanding({ ...m, createdAt: 0 }, { ...candidate, createdAt: Number.MAX_SAFE_INTEGER }) < 0,
  );
  return ahead.length + 1;
}
