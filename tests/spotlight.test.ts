import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewProfile, readBoard, rebuildBoard, register } from "../server/board";
import { encodeMember, decodeMember } from "../server/store";
import { boardFixture, githubJson, githubOwner, githubRepository, memberRecord, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));

const input = { github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" };

function githubRepos(nodes: ReturnType<typeof githubRepository>[]) {
  const fetchMock = vi.fn().mockImplementation(async () => githubJson({ data: { u0: githubOwner({ repositories: {
    totalCount: nodes.filter((repo) => !repo.isPrivate && !repo.isFork).length, nodes, pageInfo: { hasNextPage: false, endCursor: null },
  } }) } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("automatically picks one most-starred repo while retaining all developer statistics", async () => {
  const store = new TestStore();
  githubRepos([githubRepository(4), githubRepository(10), githubRepository(30)]);
  const result = await register(store, input);
  expect(result.board.repositories.map((repo) => [repo.id, repo.rank])).toEqual([["R_30", 1]]);
  expect(result.board.members[0]).toMatchObject({ stars: 44, repos: 3 });
  expect((await store.getMember("octocat"))?.projects).toHaveLength(3);
});

it("offers only eligible public original repos without changing profile totals", async () => {
  const store = new TestStore();
  githubRepos([githubRepository(4), githubRepository(5), githubRepository(30), githubRepository(100, { isFork: true }), githubRepository(200, { isPrivate: true })]);
  const result = await previewProfile(store, input.github, input.whatsapp);
  expect(result.profile.projects?.map((repo) => repo.id)).toEqual(["R_30", "R_5"]);
  expect(result.profile).toMatchObject({ stars: 39, repos: 3 });
  expect(await store.listMembers()).toEqual([]);
});

it("uses the chosen five-star repo instead of a more popular repo and preserves the choice in storage", async () => {
  const store = new TestStore();
  githubRepos([githubRepository(5), githubRepository(30)]);
  const result = await register(store, { ...input, spotlightRepositoryId: "R_5" });
  expect(result.board.repositories.map((repo) => repo.id)).toEqual(["R_5"]);
  const saved = await store.getMember("octocat");
  expect(saved?.spotlightRepositoryId).toBe("R_5");
  expect(decodeMember(encodeMember(saved!)).spotlightRepositoryId).toBe("R_5");
  expect((await rebuildBoard(store)).repositories.map((repo) => repo.id)).toEqual(["R_5"]);
});

it.each(["R_4", "R_foreign", "R_private", "R_fork", null, 5, ""])("rejects an ineligible or invalid spotlight selection %s", async (spotlightRepositoryId) => {
  const store = new TestStore();
  githubRepos([githubRepository(4), githubRepository(30), githubRepository(200, { id: "R_private", isPrivate: true }), githubRepository(100, { id: "R_fork", isFork: true })]);
  await expect(register(store, { ...input, spotlightRepositoryId })).rejects.toMatchObject({ status: 400, code: "invalid_spotlight", field: "spotlightRepositoryId" });
  expect(await store.listMembers()).toEqual([]);
});

it("keeps a developer on the board when no repo qualifies and adds a spotlight once one reaches five stars", async () => {
  const store = new TestStore();
  githubRepos([githubRepository(4)]);
  const result = await register(store, input);
  expect(result.board.repositories).toEqual([]);
  expect(result.board.members).toHaveLength(1);
  await store.patchMember("octocat", { projects: [repository({ stars: 5 })] });
  expect((await rebuildBoard(store)).repositories).toMatchObject([{ id: "R_open-kit", stars: 5 }]);
});

it("preserves a manual choice through GitHub refresh and replaces it when it drops below five stars", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  const store = new TestStore();
  const nodes = [githubRepository(5), githubRepository(30)];
  githubRepos(nodes);
  await register(store, { ...input, spotlightRepositoryId: "R_5" });
  for (const stars of [6, 4]) {
    nodes[0].stargazerCount = stars;
    vi.setSystemTime(Date.now() + 61_000);
    const work: Promise<unknown>[] = [];
    await readBoard(store, (promise) => { work.push(promise); });
    await Promise.all(work);
    expect((await store.getMember("octocat"))?.spotlightRepositoryId).toBe("R_5");
    expect((await store.getBoard())?.repositories.map((repo) => repo.id)).toEqual([stars >= 5 ? "R_5" : "R_30"]);
  }
});

it("replaces a deleted choice and removes the spotlight when no eligible repo remains", async () => {
  const store = new TestStore();
  await store.createMember(memberRecord({ spotlightRepositoryId: "R_gone", projects: [repository({ stars: 5 })] }));
  expect((await rebuildBoard(store)).repositories.map((repo) => repo.id)).toEqual(["R_open-kit"]);
  await store.patchMember("octocat", { projects: [] });
  expect((await rebuildBoard(store)).repositories).toEqual([]);
});

it("rebuilds the previous all-repository snapshot before serving it", async () => {
  const store = new TestStore();
  await store.createMember(memberRecord({ projects: [repository({ id: "R_low", stars: 4 }), repository({ id: "R_best", stars: 20 }), repository({ id: "R_other", stars: 5 })] }));
  await store.setBoard(boardFixture({ rankingVersion: 2 }));
  const result = await readBoard(store);
  expect(result.rankingVersion).toBe(7);
  expect(result.repositories.map((repo) => repo.id)).toEqual(["R_best"]);
  expect(decodeMember(encodeMember(memberRecord())).spotlightRepositoryId).toBeUndefined();
});
