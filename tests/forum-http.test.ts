import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as memberApi from "../api/forum";
import * as adminApi from "../api/forum-admin";
import * as legacyApi from "../api/forum-legacy";
import { beginGitHubSignIn, finishGitHubSignIn } from "../server/github-auth";
import { MemoryCommunityStore } from "../server/community-memory";
import { LocalForumStore } from "../server/forum-store";
import { TestStore } from "./helpers/test-store";
import { content, poll } from "./helpers/forum-contract";
import type { ForumDetail } from "../shared/forum";
import { randomUUID } from "node:crypto";
import { memberRecord } from "./helpers/fixtures";

let sessions: MemoryCommunityStore;
let forum: LocalForumStore;
let board: TestStore;
let linked = true;
let unavailable = false;
let tracking = true;
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => sessions }));
vi.mock("../server/forum-store", async (original) => ({ ...await original<typeof import("../server/forum-store")>(), getForumStore: () => forum }));
vi.mock("../server/participation", () => ({ coordinationRequest: async (_action: string, input: { login: string }) => {
  if (unavailable) throw new (await import("../server/http")).HttpError(503, "coordination_unavailable", "Membership cannot be checked right now.");
  return { activity: { linked, tracking, login: input.login }, projects: [], help: [{ id: "help_old", owner: "Alice", question: "An earlier private request", createdAt: 1, status: "open" }], contributions: [] };
} }));
const origin = "https://opencircle.test";
const aliceToken = "a".repeat(64);
const bobToken = "b".repeat(64);
const adminToken = "c".repeat(64);
function req(input?: unknown, token = aliceToken, admin = false, suffix = "", requestOrigin = origin) {
  return new Request(`${origin}/api/${admin ? "forum-admin" : "forum"}${suffix}`, { method: input ? "POST" : "GET", headers: { cookie: `${admin ? "__Host-opencircle_admin" : "opencircle_github"}=${token}`, origin: requestOrigin, "content-type": "application/json", ...(admin ? { "x-opencircle-admin": "1" } : {}) }, body: input ? JSON.stringify(input) : undefined });
}
const cmd = (body: Record<string, unknown>) => ({ requestId: randomUUID(), ...body });
beforeEach(async () => {
  linked = true; unavailable = false; tracking = true;
  sessions = new MemoryCommunityStore(null); forum = new LocalForumStore(null); board = new TestStore();
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret"); vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`); vi.stubEnv("ADMIN_GITHUB_IDS", "1");
  for (const [token, id, login, prefix] of [[aliceToken, 2, "Alice", ""], [bobToken, 3, "Bob", ""], [adminToken, 1, "Admin", "admin:"]] as const) await sessions.createSession(createHash("sha256").update(`${prefix}${token}`).digest("hex"), { id, login, avatarUrl: "" }, Date.now() + 60000);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("requires approval for member discussions even when publication is requested and exposes no private scoring ledger", async () => {
  const response = await memberApi.POST(req(cmd({ action: "create", kind: "discussion", content, publish: true })));
  expect(response.status).toBe(200);
  const pending = await response.json();
  expect(pending).toMatchObject({ review: "pending", publishedAt: null, author: { id: 2 } });
  expect(await forum.readActivity()).toEqual([]);
  expect((await memberApi.GET(req(undefined, bobToken, false, `?id=${pending.id}`))).status).toBe(404);
  const approved = await adminApi.POST(req(cmd({ action: "review", id: pending.id, version: pending.version, decision: "approve" }), adminToken, true));
  expect(approved.status).toBe(200);
  expect(await forum.readActivity()).toMatchObject([{ kind: "post", actorId: 2 }]);
  const publicResponse = await memberApi.GET(req(undefined, bobToken, false, `?id=${pending.id}`));
  const text = await publicResponse.text();
  expect(publicResponse.status).toBe(200);
  expect(text).not.toContain('"activity"');
  expect(text).not.toContain('"actorId"');
});
it("persists private per-account comment likes through authenticated handlers and rejects unverified changes", async () => {
  const created = await adminApi.POST(req(cmd({ action: "create", kind: "discussion", content, publish: true }), adminToken, true));
  const post = await created.json() as ForumDetail;
  const commented = await memberApi.POST(req(cmd({ action: "comment", id: post.id, body: "An HTTP comment to like" })));
  const comment = (await commented.json() as ForumDetail).comments[0];
  const like = cmd({ action: "like", id: post.id, commentId: comment.id, liked: true, author: { id: 999 } });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await memberApi.POST(req(like, bobToken));
    expect(response.status).toBe(200);
    const data = await response.json() as ForumDetail;
    expect(data.comments[0]).toMatchObject({ likeCount: 1, liked: true });
    expect(JSON.stringify(data)).not.toContain("likedBy");
    expect(data.likeCount).toBe(0);
  }
  const aliceResponse = await memberApi.GET(req(undefined, aliceToken, false, `?id=${post.id}`));
  expect((await aliceResponse.json()).comments[0]).toMatchObject({ likeCount: 1, liked: false });
  expect(aliceResponse.headers.get("cache-control")).toBe("private, no-store");
  expect(aliceResponse.headers.get("vary")).toBe("Cookie");
  linked = false;
  expect((await memberApi.POST(req(cmd({ action: "like", id: post.id, commentId: comment.id, liked: false }), bobToken))).status).toBe(403);
  linked = true;
  const removed = await memberApi.POST(req(cmd({ action: "like", id: post.id, commentId: comment.id, liked: false }), bobToken));
  expect((await removed.json()).comments[0]).toMatchObject({ likeCount: 0, liked: false });
});
it("resolves existing author names across feeds, comments, reports and audit without rewriting posts or exposing member records", async () => {
  const created = await adminApi.POST(req(cmd({ action: "create", kind: "discussion", content, publish: true }), adminToken, true));
  const post = await created.json() as ForumDetail;
  expect(post.author.name).toBeUndefined();
  for (const [login, name, whatsapp] of [["admin", "Naheem Olaide", "+2341111111111"], ["alice", "Alice Builder", "+2342222222222"], ["bob", "Bob Helper", "+2343333333333"]]) await board.createMember(memberRecord({ login, displayLogin: login, name, nickname: login, whatsapp }));
  const lookup = vi.spyOn(board, "getMember");
  const feed = await memberApi.GET(req(undefined, aliceToken, false, "?kind=discussion"));
  expect((await feed.json()).items[0].author).toMatchObject({ id: 1, login: "Admin", name: "Naheem Olaide" });
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(await forum.transact(post.id, false, data => data.thread!.author.name)).toBeUndefined();
  const commented = await memberApi.POST(req(cmd({ action: "comment", id: post.id, body: "An existing member's comment", author: { name: "Spoofed Name" } })));
  const comment = (await commented.json()).comments[0];
  expect(comment.author).toMatchObject({ id: 2, login: "Alice", name: "Alice Builder" });
  await memberApi.POST(req(cmd({ action: "report", id: post.id, commentId: comment.id, reason: "Please check this comment" }), bobToken));
  const adminResponse = await adminApi.GET(req(undefined, adminToken, true, `?id=${post.id}`));
  const adminData = await adminResponse.json() as ForumDetail;
  expect(adminData.author.name).toBe("Naheem Olaide");
  expect(adminData.comments[0].author.name).toBe("Alice Builder");
  expect(adminData.reports![0].author.name).toBe("Bob Helper");
  expect(adminData.reports![0].reportedComment!.author.name).toBe("Alice Builder");
  expect(adminData.audit![0].actor.name).toBe("Naheem Olaide");
  expect(JSON.stringify(adminData)).not.toContain("whatsapp");
  expect(JSON.stringify(adminData)).not.toContain("+2341111111111");
  const memberResponse = await memberApi.GET(req(undefined, aliceToken, false, `?id=${post.id}`));
  const memberData = await memberResponse.json();
  expect(memberResponse.headers.get("cache-control")).toBe("private, no-store");
  expect(memberData).not.toHaveProperty("reports");
  expect(memberData).not.toHaveProperty("audit");
  expect(memberData.author.name).toBe("Naheem Olaide");
  expect(await forum.transact(post.id, false, data => data.thread!.author.name)).toBeUndefined();
});
it("uses names from verified sessions for new authors and falls back safely when no name exists", async () => {
  await sessions.createSession(createHash("sha256").update(`admin:${adminToken}`).digest("hex"), { id: 1, login: "Admin", name: "Naheem Olaide", avatarUrl: "" }, Date.now()+60000);
  const created = await adminApi.POST(req(cmd({ action: "create", kind: "discussion", content, publish: true }), adminToken, true));
  const post = await created.json() as ForumDetail;
  expect(post.author.name).toBe("Naheem Olaide");
  expect(await forum.transact(post.id, false, data => data.thread!.author.name)).toBe("Naheem Olaide");
  const commented = await memberApi.POST(req(cmd({ action: "comment", id: post.id, body: "A member without a display name" })));
  const data = await commented.json() as ForumDetail;
  expect(data.comments[0].author).toEqual({ id: 2, login: "Alice", avatarUrl: "" });
  expect(data.author.name).toBe("Naheem Olaide");
});
it("enforces member verification and admin sessions on every route, including legacy Help", async () => {
  expect((await memberApi.GET(new Request(`${origin}/api/forum`))).status).toBe(401);
  expect((await adminApi.GET(req(undefined, aliceToken, true))).status).toBe(401);
  linked = false;
  expect((await memberApi.GET(req())).status).toBe(403);
  expect((await memberApi.POST(req(cmd({ action: "create", kind: "question", content })))).status).toBe(403);
  expect((await legacyApi.GET(req())).status).toBe(403);
  linked = true; tracking = false;
  expect((await memberApi.GET(req())).status).toBe(503);
  tracking = true; unavailable = true;
  const failed = await memberApi.GET(req()); expect(failed.status).toBe(503); expect(failed.headers.get("cache-control")).toBe("no-store");
  expect((await adminApi.GET(req(undefined, adminToken, true))).status).toBe(200);
});
it("covers an admin discussion, member comment and vote, private question review and private revisions through the real handlers", async () => {
  const postResponse = await adminApi.POST(req(cmd({ action: "create", kind: "discussion", content, poll, publish: true }), adminToken, true));
  expect(postResponse.status).toBe(200);
  const post = await postResponse.json() as ForumDetail;
  const comment = await memberApi.POST(req(cmd({ action: "comment", id: post.id, body: "Useful context from a member", author: { id: 999 } })));
  expect((await comment.json()).comments[0].author.id).toBe(2);
  const voted = await memberApi.POST(req(cmd({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_2" })));
  expect((await voted.json()).poll.total).toBe(1);
  const pendingResponse = await memberApi.POST(req(cmd({ action: "create", kind: "question", content })));
  const pending = await pendingResponse.json() as ForumDetail;
  const guessed = await memberApi.GET(req(undefined, bobToken, false, `?id=${pending.id}`));
  expect(guessed.status).toBe(404); expect(guessed.headers.get("cache-control")).toBe("no-store");
  const privateResponse = await memberApi.GET(req(undefined, aliceToken, false, `?id=${pending.id}`)); expect(privateResponse.headers.get("cache-control")).toBe("private, no-store"); expect(privateResponse.headers.get("vary")).toBe("Cookie");
  expect((await adminApi.POST(req(cmd({ action: "review", id: pending.id, version: 1, decision: "approve", reason: "Private note" }), adminToken, true))).status).toBe(200);
  expect((await memberApi.POST(req(cmd({ action: "edit", id: pending.id, version: 2, content: { ...content, body: "Unapproved private proposed edit" } })))).status).toBe(200);
  const publicBody = await (await memberApi.GET(req(undefined, bobToken, false, `?id=${pending.id}`))).text();
  expect(publicBody).not.toContain("Unapproved private"); expect(publicBody).not.toContain("Private note"); expect(publicBody).not.toContain("reviewReason");
  const legacy = await legacyApi.GET(req()); expect(await legacy.json()).toMatchObject({ help: [{ id: "help_old" }] });
});
it("rejects cross-origin requests, large bodies, invalid data and expired sessions", async () => {
  expect((await memberApi.POST(req(cmd({ action: "create", kind: "question", content }), aliceToken, false, "", "https://foreign.test"))).status).toBe(403);
  expect((await adminApi.POST(new Request(`${origin}/api/forum-admin`, { method: "POST", headers: { "content-type": "application/json", origin, cookie: `__Host-opencircle_admin=${adminToken}` }, body: JSON.stringify(cmd({ action: "create", kind: "discussion", content })) }))).status).toBe(403);
  expect((await memberApi.POST(req(cmd({ action: "create", kind: "question", content: { ...content, body: "x".repeat(50000) } })))).status).toBe(413);
  expect((await memberApi.POST(req(cmd({ action: "create", kind: "question", content: { ...content, category: "invented" } })))).status).toBe(400);
  await sessions.removeSession(createHash("sha256").update(aliceToken).digest("hex"));
  expect((await memberApi.GET(req())).status).toBe(401);
});
it("preserves community tabs and permalinks through OAuth while rejecting external or arbitrary destinations", async () => {
  const destinations = ["/community", "/community?tab=questions", `/community/${randomUUID()}`, "/community/help/help_old", "/community?tab=questions&mine=1", "https://foreign.test/community", "//foreign.test", "/community?next=https://foreign.test", "/community/../../admin"];
  for (const returnTo of destinations) {
    const start = beginGitHubSignIn(new Request(`${origin}/api/auth-start?${new URLSearchParams({ returnTo })}`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test", token_type: "bearer" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 2, login: "Alice", type: "User" }))));
    const result = await finishGitHubSignIn(new Request(`${origin}/api/auth-callback?code=test&state=${state}`, { headers: { cookie: start.headers.get("set-cookie")!.split(";")[0] } }), sessions);
    expect(result.headers.get("location")).toBe(destinations.indexOf(returnTo) < 5 ? returnTo : "/tools");
  }
});
