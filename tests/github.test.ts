import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubError, lookupMany, lookupOne } from "../server/github";
import { contributionCalendar, githubJson, githubOwner, githubRepository } from "./helpers/fixtures";

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GitHub profile and repository lookup", () => {
  const starEdge = (id: string, owner = "Peer", time = Date.now() - 1000, fields = {}) => ({ starredAt: new Date(time).toISOString(), node: { id, isPrivate: false, isFork: false, owner: { __typename: "User", login: owner }, ...fields } });
  const starConnection = (edges: unknown[], hasNextPage = false, endCursor: string | null = null) => ({ edges, isOverLimit: false, pageInfo: { hasNextPage, endCursor } });

  it("paginates all star history and filters private, fork, self and organization stars", async () => {
    const now = Date.now();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ starredRepositories: starConnection([starEdge("R_peer"), starEdge("R_self", "oCtOcAt"), starEdge("R_private", "Peer", now - 1000, { isPrivate: true }), starEdge("R_fork", "Peer", now - 1000, { isFork: true }), starEdge("R_org", "Org", now - 1000, { owner: { __typename: "Organization", login: "Org" } })], true, "stars-100") }) } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { starredRepositories: starConnection([starEdge("R_next", "Second", now - 2000), starEdge("R_old", "Old", now - 29 * 86400000)], true, "stars-200") } } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { starredRepositories: starConnection([starEdge("R_older", "Older", now - 300 * 86400000)]) } } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await lookupOne("octocat")).toMatchObject({ kind: "user", stats: { starredRepositories: [{ repositoryId: "R_peer", ownerLogin: "peer" }, { repositoryId: "R_next", ownerLogin: "second" }, { repositoryId: "R_old", ownerLogin: "old" }, { repositoryId: "R_older", ownerLogin: "older" }], starHistoryVersion: 2 } });
    const initial = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(initial.query).toContain("starredRepositories(first: 100, orderBy: { field: STARRED_AT, direction: DESC })");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).variables).toEqual({ login: "Octocat", after: "stars-100" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, null, { edges: [], isOverLimit: true, pageInfo: { hasNextPage: false, endCursor: null } }, starConnection([{ ...starEdge("R_bad"), starredAt: "invalid" }])])("rejects missing or incomplete star histories instead of erasing cached help", async (starredRepositories) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ starredRepositories }) } })));
    await expect(lookupOne("octocat")).rejects.toMatchObject({ code: "upstream" });
  });

  it("rejects failed and repeated star pages without publishing partial help", async () => {
    const connection = starConnection([starEdge("R_peer")], true, "repeated");
    for (const response of [githubJson({}, 502), githubJson({ data: { user: { starredRepositories: connection } } })]) {
      const request = vi.fn().mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ starredRepositories: connection }) } })).mockResolvedValueOnce(response);
      vi.stubGlobal("fetch", request);
      await expect(lookupOne("octocat")).rejects.toMatchObject({ code: "upstream" });
      expect(request).toHaveBeenCalledTimes(2);
    }
  });

  it("uses each member's joining day instead of a rolling 30-day window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(githubJson({ data: {
      u0: githubOwner(), u1: githubOwner({ login: "Second" }),
    } }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await lookupMany(["Octocat", "second"], new Map([
      ["octocat", Date.parse("2026-08-01T18:15:00Z")],
      ["second", Date.parse("2026-09-20T08:00:00Z")],
    ]));

    const { variables, query } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(variables).toMatchObject({
      f0_0: "2026-08-01T00:00:00.000Z", f1_0: "2026-09-20T00:00:00.000Z",
      t0_0: "2026-10-14T12:00:00.000Z", t1_0: "2026-10-14T12:00:00.000Z",
    });
    expect(query).toContain("avatarUrl(size: 160)");
    expect(outcome.results.get("octocat")).toMatchObject({ kind: "user", stats: {
      activity: 9, activitySince: Date.parse("2026-08-01T00:00:00Z"), avatarUrl: "https://avatars.githubusercontent.com/u/1",
    } });
  });

  it("keeps counting beyond a year using consecutive non-overlapping GitHub ranges", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ activity1: {
      totalCommitContributions: 130, totalIssueContributions: 0, totalPullRequestContributions: 0,
      totalPullRequestReviewContributions: 0, totalRepositoryContributions: 0,
    } }) } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOne("octocat", Date.parse("2025-08-01T19:00:00Z"));

    const { variables } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(variables).toMatchObject({
      f0_0: "2025-08-01T00:00:00.000Z", t0_0: "2026-07-31T23:59:59.999Z",
      f0_1: "2026-08-01T00:00:00.000Z", t0_1: "2026-10-14T12:00:00.000Z",
    });
    expect(result).toMatchObject({ kind: "user", stats: { activity: 139 } });
  });

  it.each([null, {}, { totalCommitContributions: -1 }])("rejects incomplete contribution data instead of resetting the score", async (activity0) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ activity0 }) } })));
    await expect(lookupOne("octocat")).rejects.toMatchObject({ code: "upstream" });
  });

  it("loads every repository beyond the first 100 and sums all owned public stars", async () => {
    const first = Array.from({ length: 100 }, (_, i) => githubRepository(i + 1));
    const second = Array.from({ length: 25 }, (_, i) => githubRepository(i + 101));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: { totalCount: 125, nodes: first, pageInfo: { hasNextPage: true, endCursor: "cursor-100" } } }) } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { repositories: { totalCount: 125, nodes: second, pageInfo: { hasNextPage: false, endCursor: "cursor-125" } } } } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOne("octocat");

    expect(result.kind).toBe("user");
    if (result.kind !== "user") throw new Error("Expected a public GitHub user");
    expect(result.stats.projects).toHaveLength(125);
    expect(result.stats.stars).toBe(7875);
    expect(result.stats.repos).toBe(125);
    expect(result.stats.activity).toBe(9);
    expect(result.stats.projects?.at(-1)).toMatchObject({ id: "R_125", fullName: "Octocat/project-125", stars: 125 });
    const pageRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(pageRequest.variables).toEqual({ login: "Octocat", after: "cursor-100" });
    expect(pageRequest.query).toContain("privacy: PUBLIC");
    expect(pageRequest.query).toContain("isFork: false");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("bearer test-token");
  });

  it("excludes private projects, forks and null nodes from public repository results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({
      data: { u0: githubOwner({ repositories: {
        totalCount: 1,
        nodes: [githubRepository(3), githubRepository(1000, { isPrivate: true }), githubRepository(999, { isFork: true }), null],
        pageInfo: { hasNextPage: false, endCursor: null },
      } }) },
    })));

    const result = await lookupOne("Octocat");

    expect(result).toMatchObject({ kind: "user", stats: { stars: 3, repos: 1, projects: [{ id: "R_3" }] } });
  });

  it("does not publish incomplete repository totals when a later page fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: {
        totalCount: 101,
        nodes: [githubRepository(100)],
        pageInfo: { hasNextPage: true, endCursor: "cursor-100" },
      } }) } }))
      .mockResolvedValueOnce(githubJson({ errors: [{ type: "RATE_LIMITED", message: "Try later" }] })));

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("detects repeated pagination cursors instead of looping indefinitely", async () => {
    const connection = { totalCount: 101, nodes: [githubRepository(1)], pageInfo: { hasNextPage: true, endCursor: "repeated" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: connection }) } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { repositories: connection } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps valid members when one GraphQL alias fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({
      data: { u0: githubOwner(), u1: null, u2: { __typename: "Organization", login: "CircleOrg", avatarUrl: "" } },
      errors: [{ type: "INTERNAL", message: "Profile failed", path: ["u1"] }],
    })));

    const outcome = await lookupMany(["Octocat", "broken", "CircleOrg"]);

    expect(outcome.results.get("octocat")?.kind).toBe("user");
    expect(outcome.results.get("broken")?.kind).toBe("error");
    expect(outcome.results.get("circleorg")?.kind).toBe("organization");
    expect(outcome.error).toBeInstanceOf(GithubError);
  });

  it.each([[401, "unauthorized"], [403, "rate_limited"], [429, "rate_limited"], [502, "upstream"]])(
    "reports GitHub HTTP %i without returning invented stats",
    async (status, code) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({}, Number(status))));
      await expect(lookupOne("Octocat")).rejects.toMatchObject({ code });
    },
  );

  it("collects the UTC days that carry public contributions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ activity0: {
      totalCommitContributions: 4, totalIssueContributions: 1, totalPullRequestContributions: 2,
      totalPullRequestReviewContributions: 1, totalRepositoryContributions: 1,
      ...contributionCalendar({ "2026-10-12": 2, "2026-10-13": 0, "2026-10-14": 3, bad: 5 }),
    } }) } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOne("octocat");

    expect(result).toMatchObject({ kind: "user", stats: {
      activity: 9, commits: 4, pullRequests: 2, reviews: 1, issues: 1,
      activityDays: ["2026-10-12", "2026-10-14"],
    } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).query).toContain("contributionCalendar");
  });

  it("ignores a missing calendar without discarding contribution totals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ activity0: {
      totalCommitContributions: 4, totalIssueContributions: 1, totalPullRequestContributions: 2,
      totalPullRequestReviewContributions: 1, totalRepositoryContributions: 1,
      contributionCalendar: { weeks: [{ contributionDays: [{ date: "not-a-day", contributionCount: 4 }] }] },
    } }) } })));

    const result = await lookupOne("octocat");

    expect(result).toMatchObject({ kind: "user", stats: { activity: 9, activityDays: [] } });
  });

  it("refuses to credit a calendar that mixed in restricted contributions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T12:00:00Z"));
    const fetchMock = vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ activity0: {
      totalCommitContributions: 4, totalIssueContributions: 1, totalPullRequestContributions: 2,
      totalPullRequestReviewContributions: 1, totalRepositoryContributions: 1,
      hasAnyRestrictedContributions: true,
      ...contributionCalendar({ "2026-10-12": 2, "2026-10-14": 3 }),
    } }) } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOne("octocat");

    expect(result).toMatchObject({ kind: "user", stats: { activity: 9, activityDays: [] } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).query).toContain("hasAnyRestrictedContributions");
  });

  it("fails clearly without a server GitHub token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
