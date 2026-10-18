import type { Board, GithubRepository, PublicMember } from "../../shared/types";
import { contributionStart, DEFAULT_WEIGHTS } from "../../shared/ranking";
import { DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "../../shared/brand";
import { RANKING_PERIODS, rankingWindowStart, type HelperHistory, type HelperScore } from "../../shared/coordination";
import type { MemberRecord } from "../../server/store";

export function repository(overrides: Partial<GithubRepository> = {}): GithubRepository {
  return {
    id: "R_open-kit",
    name: "open-kit",
    fullName: "Octocat/open-kit",
    url: "https://github.com/Octocat/open-kit",
    description: "Tools built by the circle",
    stars: 10,
    forks: 2,
    language: "TypeScript",
    updatedAt: "2026-10-14T12:00:00Z",
    ...overrides,
  };
}

export function memberRecord(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    login: "octocat",
    displayLogin: "Octocat",
    nickname: "Octo",
    whatsapp: "+2348031234567",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    name: "Octo Cat",
    stars: 10,
    followers: 2,
    repos: 1,
    activity: 9,
    activitySince: contributionStart(overrides.createdAt ?? Date.now()),
    projects: [repository()],
    starredRepositories: [],
    starSupportUpdatedAt: Date.now(),
    starHistoryVersion: 2,
    hidden: false,
    createdAt: Date.now(),
    statsUpdatedAt: Date.now(),
    rank: 0,
    prevRank: 0,
    rankChangedAt: 0,
    ...overrides,
  };
}

export function publicMember(overrides: Partial<PublicMember> = {}): PublicMember {
  return {
    login: "Octocat",
    nickname: "Octo",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    score: 68,
    stars: 10,
    followers: 2,
    repos: 1,
    activity: 9,
    upvotes: 0,
    rank: 1,
    delta: 0,
    isNew: true,
    ...overrides,
  };
}

export function boardFixture(overrides: Partial<Board> = {}): Board {
  return {
    rankingVersion: 6,
    helpersCheckedAt: Date.now(),
    communityRepositoryCheckedAt: Date.now(),
    members: [],
    repositories: [],
    updatedAt: Date.now(),
    refreshedAt: Date.now(),
    statsDelayed: false,
    invite: { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE },
    weights: { ...DEFAULT_WEIGHTS },
    ...overrides,
  };
}

export function githubRepository(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `R_${index}`,
    name: `project-${index}`,
    nameWithOwner: `Octocat/project-${index}`,
    url: `https://github.com/Octocat/project-${index}`,
    description: null,
    stargazerCount: index,
    forkCount: index % 3,
    updatedAt: "2026-10-14T12:00:00Z",
    isPrivate: false,
    isFork: false,
    primaryLanguage: { name: "TypeScript" },
    ...overrides,
  };
}

export function githubOwner(overrides: Record<string, unknown> = {}) {
  return {
    __typename: "User",
    login: "Octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    name: "Octo Cat",
    followers: { totalCount: 2 },
    starredRepositories: { isOverLimit: false, edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
    repositories: {
      totalCount: 1,
      nodes: [githubRepository(10, { id: "R_open-kit", name: "open-kit", nameWithOwner: "Octocat/open-kit", url: "https://github.com/Octocat/open-kit", description: "Tools built by the circle", forkCount: 2 })],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    activity0: {
      totalCommitContributions: 4,
      totalIssueContributions: 1,
      totalPullRequestContributions: 2,
      totalPullRequestReviewContributions: 1,
      totalRepositoryContributions: 1,
    },
    ...overrides,
  };
}

export function contributionCalendar(days: Record<string, number>) {
  return {
    contributionCalendar: {
      weeks: [{
        contributionDays: Object.entries(days).map(([date, contributionCount]) => ({ date, contributionCount })),
      }],
    },
  };
}

export function githubJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function helperHistoryFixture(members: HelperScore[] = [], overrides: Partial<Record<"7d" | "30d", HelperScore[]>> = {}, now = Date.now()): HelperHistory {
  return { version: 2, generatedAt: now, periods: Object.fromEntries(RANKING_PERIODS.map((period) => [period, { windowStartedAt: rankingWindowStart(period, now), members: period === "all" ? members : overrides[period] ?? members }])) as HelperHistory["periods"] };
}
