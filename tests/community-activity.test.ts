import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommunityActivity } from "../shared/community-activity";
import { communityActivityScores } from "../server/forum-activity";
import { LocalForumStore } from "../server/forum-store";
import { commandForum } from "../server/forum";
import { rebuildBoard, readBoard, previewProfile, register } from "../server/board";
import { coordinationRequest } from "../server/participation";
import { TestStore } from "./helpers/test-store";
import { admin, alice, bob, command, content, poll } from "./helpers/forum-contract";
import { githubJson, githubOwner, helperHistoryFixture, memberRecord } from "./helpers/fixtures";

const state = vi.hoisted(() => ({ forum: undefined as LocalForumStore | undefined }));
vi.mock("../server/forum-store", async (original) => ({ ...await original<typeof import("../server/forum-store")>(), getForumStore: () => state.forum! }));
vi.mock("../server/participation", () => ({ coordinationRequest: vi.fn() }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));
vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
const now = Date.parse("2026-10-19T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  state.forum = new LocalForumStore(null);
  vi.mocked(coordinationRequest).mockResolvedValue(helperHistoryFixture());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("awards active dated actions once and retains the original date through unlikes, voting changes and moderation", async () => {
  const forum = state.forum!;
  const post = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }), now);
  const comment = command({ action: "comment", id: post.id, body: "A helpful explanation for this question." });
  await Promise.all(Array.from({ length: 8 }, () => commandForum(forum, alice, comment, now)));
  const like = command({ action: "like", id: post.id, liked: true });
  await Promise.all(Array.from({ length: 8 }, () => commandForum(forum, alice, like, now)));
  const voted = await commandForum(forum, alice, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_1" }), now);
  await commandForum(forum, alice, command({ action: "vote", id: post.id, ballot: voted.poll!.ballot, optionId: "option_2" }), now + 1);
  const first = communityActivityScores(await forum.readActivity(), now + 1).get(alice.profile.id)!;
  expect(first.all).toEqual({ points: 4, posts: 0, comments: 1, likes: 1, votes: 1 });
  await commandForum(forum, alice, command({ action: "like", id: post.id, liked: false }), now + 2);
  expect(communityActivityScores(await forum.readActivity(), now + 2).get(alice.profile.id)!.all.points).toBe(3);
  const later = now + 8 * 86_400_000;
  await commandForum(forum, alice, command({ action: "like", id: post.id, liked: true }), later);
  expect(communityActivityScores(await forum.readActivity(), later).get(alice.profile.id)).toMatchObject({ all: { points: 4 }, "7d": { points: 0 }, "30d": { points: 4 } });
  const hidden = await commandForum(forum, admin, command({ action: "moderate", id: post.id, version: post.version, operation: "hide", reason: "Check this content" }), later);
  expect((await forum.readActivity()).filter((event) => event.active)).toEqual([]);
  const restored = await commandForum(forum, admin, command({ action: "moderate", id: post.id, version: hidden.version, operation: "restore", reason: "Reviewed content" }), later + 1);
  expect(communityActivityScores(await forum.readActivity(), later + 1).get(alice.profile.id)!["7d"].points).toBe(0);
  expect(JSON.stringify(restored)).not.toContain('"activity"');
  expect(JSON.stringify(restored)).not.toContain('"actorId"');
});

it("excludes self-actions and short comments, and revokes replies and likes under a hidden parent", async () => {
  const forum = state.forum!;
  const post = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }));
  await commandForum(forum, admin, command({ action: "like", id: post.id, liked: true }));
  await commandForum(forum, admin, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_1" }));
  await commandForum(forum, admin, command({ action: "comment", id: post.id, body: "My own post should not earn reply points." }));
  const commented = await commandForum(forum, alice, command({ action: "comment", id: post.id, body: "A useful root comment here." }));
  const root = commented.comments.find((item) => item.author.id === alice.profile.id)!;
  await commandForum(forum, alice, command({ action: "like", id: post.id, commentId: root.id, liked: true }));
  await commandForum(forum, alice, command({ action: "comment", id: post.id, parentId: root.id, body: "Replying to my own comment gets no credit." }));
  await commandForum(forum, bob, command({ action: "comment", id: post.id, body: "Thanks" }));
  const replied = await commandForum(forum, bob, command({ action: "comment", id: post.id, parentId: root.id, body: "A useful response to your point." }));
  const reply = replied.comments.find((item) => item.author.id === bob.profile.id && item.parentId)!;
  await commandForum(forum, alice, command({ action: "like", id: post.id, commentId: reply.id, liked: true }));
  const scores = communityActivityScores(await forum.readActivity(), now);
  expect(scores.get(admin.profile.id)!.all.points).toBe(5);
  expect(scores.get(alice.profile.id)!.all.points).toBe(3);
  expect(scores.get(bob.profile.id)!.all.points).toBe(2);
  await commandForum(forum, admin, command({ action: "moderate", id: post.id, version: post.version, operation: "hide-comment", commentId: root.id, reason: "Hide this exchange" }));
  const hidden = communityActivityScores(await forum.readActivity(), now);
  expect(hidden.has(alice.profile.id)).toBe(false);
  expect(hidden.has(bob.profile.id)).toBe(false);
});

it("applies daily, duplicate-content and per-thread limits consistently at period boundaries", () => {
  const events: CommunityActivity[] = [];
  for (const kind of ["post", "comment", "like", "vote"] as const) for (let i = 0; i < 20; i++) events.push({ kind, actorId: 2, targetId: `${kind}-${i}`, threadId: `thread-${i}`, at: now, fingerprint: ["post", "comment"].includes(kind) ? `${kind}-${i}` : undefined });
  expect(communityActivityScores(events, now).get(2)!.all).toEqual({ points: 35, posts: 2, comments: 5, likes: 10, votes: 5 });
  const comment: CommunityActivity = { kind: "comment", actorId: 3, targetId: "first", threadId: "thread", at: now - 7 * 86_400_000, fingerprint: "same" };
  const limited = communityActivityScores([comment, { ...comment }, { ...comment, targetId: "duplicate", at: now, threadId: "other" }, { ...comment, targetId: "second", at: now, fingerprint: "second" }, { ...comment, targetId: "third", at: now, fingerprint: "third" }], now).get(3)!;
  expect(limited).toMatchObject({ all: { points: 4, comments: 2 }, "7d": { points: 4 }, "30d": { points: 4 } });
  const day = communityActivityScores([...events, { kind: "post", actorId: 2, targetId: "next-day", threadId: "new", at: now + 86_400_000, fingerprint: "new" }], now + 86_400_000).get(2)!;
  expect(day.all.points).toBe(40);
  expect(communityActivityScores([{ ...comment, at: now + 1 }, { ...comment, actorId: -1 }], now).size).toBe(0);
  expect(communityActivityScores([{ ...comment, active: false }, { ...comment, targetId: "copied", threadId: "other", at: now }], now).size).toBe(0);
});

it("counts legacy undated interactions only in All time without inventing dates during hide, restore or retry", async () => {
  const forum = state.forum!;
  const post = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }), now - 40 * 86_400_000);
  await forum.transact(post.id, true, (data) => { delete data.thread!.activity; data.thread!.likedBy = [2]; data.votes = { "2": "option_1" }; });
  expect(communityActivityScores(await forum.readActivity(), now).get(2)).toMatchObject({ all: { points: 2 }, "7d": { points: 0 }, "30d": { points: 0 } });
  const hidden = await commandForum(forum, admin, command({ action: "moderate", id: post.id, version: post.version, operation: "hide", reason: "Review old content" }));
  await commandForum(forum, admin, command({ action: "moderate", id: post.id, version: hidden.version, operation: "restore", reason: "Reviewed content" }));
  await commandForum(forum, alice, command({ action: "like", id: post.id, liked: false }));
  await commandForum(forum, alice, command({ action: "like", id: post.id, liked: true }));
  expect(communityActivityScores(await forum.readActivity(), now).get(2)).toMatchObject({ all: { points: 2 }, "7d": { points: 0 } });
});

it("ranks immutable GitHub identities in every period, updates without a GitHub refresh and preserves scores during an outage", async () => {
  const forum = state.forum!;
  const store = new TestStore();
  await store.createMember(memberRecord({ githubId: 2, login: "renamedalice", displayLogin: "RenamedAlice", helperPeriods: { all: { points: 0, contributions: 0, peers: 0 }, "7d": { points: 0, contributions: 0, peers: 0 }, "30d": { points: 0, contributions: 0, peers: 0 } } }));
  await store.createMember(memberRecord({ githubId: 3, login: "bob", displayLogin: "Bob", whatsapp: "+447700900123", nickname: "Bob" }));
  const post = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content, publish: true }));
  await commandForum(forum, alice, command({ action: "comment", id: post.id, body: "A useful explanation which earns credit." }));
  const board = await rebuildBoard(store);
  expect(board.members[0]).toMatchObject({ login: "RenamedAlice", communityPoints: 2, score: 22, rank: 1, communityActivity: { comments: 1 } });
  expect(board.periods?.["7d"][0]).toMatchObject({ login: "RenamedAlice", communityPoints: 2, score: 22 });
  await commandForum(forum, bob, command({ action: "comment", id: post.id, body: "A different useful explanation from Bob." }));
  await commandForum(forum, bob, command({ action: "like", id: post.id, liked: true }));
  vi.setSystemTime(now + 11_000);
  const jobs: Promise<unknown>[] = [];
  expect(await readBoard(store, (work) => { jobs.push(work); })).toEqual(board);
  await Promise.all(jobs);
  const updated = (await store.getBoard())!;
  expect(updated.members[0]).toMatchObject({ login: "Bob", communityPoints: 3, score: 23 });
  expect(vi.mocked(coordinationRequest)).toHaveBeenCalledTimes(1);
  const read = vi.spyOn(forum, "readActivity").mockRejectedValue(new Error("Database unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const cached = await rebuildBoard(store);
  expect(cached.communityDelayed).toBe(true);
  expect(cached.members.map((member) => member.communityPoints)).toEqual(updated.members.map((member) => member.communityPoints));
  expect(log).toHaveBeenCalled();
  read.mockRestore(); log.mockRestore();
  vi.stubEnv("GITHUB_TOKEN", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ login: "RenamedAlice", databaseId: 2 }) } })));
  expect((await previewProfile(store, "RenamedAlice", "+2348031234567")).score).toBe(updated.members.find((member) => member.login === "RenamedAlice")!.score);
  expect(JSON.stringify(updated)).not.toContain('"actorId"');
  expect(JSON.stringify(updated)).not.toContain('"fingerprint"');
});

it("includes previously earned activity immediately when a member joins the leaderboard and persists their account ID", async () => {
  const forum = state.forum!;
  const pending = await commandForum(forum, alice, command({ action: "create", kind: "discussion", content }));
  await commandForum(forum, admin, command({ action: "review", id: pending.id, version: pending.version, decision: "approve" }));
  vi.stubEnv("GITHUB_TOKEN", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ login: "Alice", databaseId: 2 }) } })));
  const store = new TestStore();
  const result = await register(store, { github: "Alice", whatsapp: "+2348031234567", nickname: "Alice" });
  expect(await store.getMember("alice")).toMatchObject({ githubId: 2 });
  expect(result.board.members[0]).toMatchObject({ login: "Alice", communityPoints: 5, score: 25 });
});
