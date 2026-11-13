import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewProfile, readBoard, rebuildBoard, register } from "../server/board";
import { decodeMember, encodeMember } from "../server/store";
import { communityStarHelps } from "../shared/star-help";
import { TestStore } from "./helpers/test-store";
import { boardFixture, githubJson, githubOwner, memberRecord } from "./helpers/fixtures";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));
const now = Date.parse("2026-10-16T14:00:00Z");
const star = (ownerLogin = "peer", repositoryId = "R_peer", starredAt = now - 1000) => ({ repositoryId, ownerLogin, starredAt });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function community() {
  const store = new TestStore();
  await store.createMember(memberRecord({ starredRepositories: [star()] }));
  await store.createMember(memberRecord({ login: "peer", displayLogin: "Peer", nickname: "Peer", whatsapp: "+447700900123", stars: 1000000, followers: 1000000 }));
  return store;
}

it("credits the giver once per other visible community member, including older stars while excluding self, outsiders and future timestamps", () => {
  expect(communityStarHelps("octocat", [star("PeEr"), star("peer", "R_another"), star("octocat"), star("outsider"), star("old", "R_old", now - 28 * 86400000), star("future", "R_future", now + 1)], new Set(["octocat", "peer", "old", "future"]), now)).toBe(2);
});

it("puts a star giver above unlimited popularity, combines confirmed help without writing combined totals back, and keeps receipts private", async () => {
  const store = await community();
  await store.patchMember("octocat", { helperPoints: 25, helpfulContributions: 1, helpedMembers: 1 });
  const board = await rebuildBoard(store);
  expect(board.members).toMatchObject([{ login: "Octocat", score: 65, helperPoints: 45, starHelps: 1, helpfulContributions: 1 }, { login: "Peer", score: 20, starHelps: 0 }]);
  expect(await store.getMember("octocat")).toMatchObject({ helperPoints: 25 });
  expect((await rebuildBoard(store)).members[0].score).toBe(65);
  expect(JSON.stringify(board)).not.toContain("starredRepositories");
  expect(JSON.stringify(board)).not.toContain("R_peer");
  const record = (await store.getMember("octocat"))!;
  expect(decodeMember(encodeMember(record))).toMatchObject({ starredRepositories: [star()], starSupportUpdatedAt: now });
});

it("one star beats a full reputation score even with no reputation of its own", async () => {
  const store = await community();
  await store.patchMember("octocat", { stars: 0, followers: 0, repos: 0, activity: 0 });
  expect((await rebuildBoard(store)).members).toMatchObject([{ login: "Octocat", score: 20, helperPoints: 20 }, { login: "Peer", score: 20, helperPoints: 0 }]);
});

it("removes credit when a recipient is hidden or leaves, and preserves all-time stars during outages", async () => {
  const store = await community();
  expect((await rebuildBoard(store)).members[0].starHelps).toBe(1);
  await store.patchMember("peer", { hidden: true });
  expect((await rebuildBoard(store)).members[0].starHelps).toBe(0);
  await store.patchMember("peer", { hidden: false });
  vi.setSystemTime(now + 90 * 86400000);
  expect((await rebuildBoard(store)).members.find((m) => m.login === "Octocat")?.starHelps).toBe(1);
  vi.setSystemTime(now);
  await store.deleteMember("peer");
  expect((await rebuildBoard(store)).members[0].starHelps).toBe(0);
});

it("matches preview and registration scores using GitHub activity from outside the site without leaking unrelated stars", async () => {
  const store = new TestStore();
  await store.createMember(memberRecord({ login: "peer", displayLogin: "Peer", nickname: "Peer", whatsapp: "+447700900123" }));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => githubJson({ data: { u0: githubOwner({ starredRepositories: {
    isOverLimit: false, edges: [{ starredAt: new Date(now - 1000).toISOString(), node: { id: "R_peer", isPrivate: false, isFork: false, owner: { __typename: "User", login: "Peer" } } }], pageInfo: { hasNextPage: false, endCursor: null },
  } }) } })));
  const preview = await previewProfile(store, "Octocat", "+2348031234567");
  expect(preview).toMatchObject({ score: 40, helperPoints: 20 });
  expect(JSON.stringify(preview)).not.toContain("starredRepositories");
  const result = await register(store, { github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" });
  expect(result.board.members.find((m) => m.login === "Octocat")).toMatchObject({ score: preview.score, starHelps: 1 });
});

it("refreshes legacy records immediately, preserves credit on upstream failures and removes it after unstar recovery", async () => {
  const store = await community();
  await store.patchMember("octocat", { starSupportUpdatedAt: 0 });
  await store.setBoard(boardFixture({ rankingVersion: 4, refreshedAt: 0 }));
  let mode: "starred" | "offline" | "removed" = "starred";
  const request = vi.fn(async (_url: string, init: RequestInit) => {
    if (mode === "offline") return githubJson({}, 502);
    const { variables } = JSON.parse(String(init.body));
    const data = Object.fromEntries(Object.entries(variables).filter(([key]) => /^l\d+$/.test(key)).map(([key, login]) => [key.replace("l", "u"), githubOwner({ login: login === "octocat" ? "Octocat" : "Peer", starredRepositories: {
      isOverLimit: false,
      edges: login === "octocat" && mode === "starred" ? [{ starredAt: new Date(now - 1000).toISOString(), node: { id: "R_peer", isPrivate: false, isFork: false, owner: { __typename: "User", login: "Peer" } } }] : [],
      pageInfo: { hasNextPage: false, endCursor: null },
    } })]));
    return githubJson({ data });
  });
  vi.stubGlobal("fetch", request);
  async function refresh() {
    const work: Promise<unknown>[] = [];
    await readBoard(store, (promise) => work.push(promise));
    await Promise.all(work);
    return store.getBoard();
  }
  expect(await refresh()).toMatchObject({ rankingVersion: 7, statsDelayed: false, members: expect.arrayContaining([expect.objectContaining({ login: "Octocat", starHelps: 1, score: 40 })]) });
  vi.setSystemTime(now + 61000); mode = "offline";
  expect(await refresh()).toMatchObject({ statsDelayed: true, members: expect.arrayContaining([expect.objectContaining({ login: "Octocat", starHelps: 1 })]) });
  vi.setSystemTime(now + 122000); mode = "removed";
  expect(await refresh()).toMatchObject({ statsDelayed: false, members: expect.arrayContaining([expect.objectContaining({ login: "Octocat", starHelps: 0, score: 20 })]) });
  expect((await store.getMember("octocat"))?.starredRepositories).toEqual([]);
});


it("uses seven-day and thirty-day cutoffs without re-crediting another repo from an already supported member", () => {
  const members = new Set(["peer", "older", "month", "week", "future"]);
  const receipts = [star("peer", "R_old-peer", now - 90 * 86400000), star("peer", "R_new-peer"), star("older", "R_older", now - 30 * 86400000), star("month", "R_month", now - 7 * 86400000), star("week", "R_week", now - 1000), star("future", "R_future", now + 1)];
  expect(communityStarHelps("octocat", receipts, members, now)).toBe(4);
  expect(communityStarHelps("octocat", receipts, members, now, "30d")).toBe(2);
  expect(communityStarHelps("octocat", receipts, members, now, "7d")).toBe(1);
});
