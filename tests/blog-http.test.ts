import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as blogApi from "../api/blog";
import * as adminApi from "../api/blog-admin";
import * as imageApi from "../api/blog-image";
import { MemoryCommunityStore } from "../server/community-memory";
import { LocalBlogStore } from "../server/blog-store";
import { TestStore } from "./helpers/test-store";
import { body, content } from "./helpers/blog-contract";

let sessions: MemoryCommunityStore;
let blog: LocalBlogStore;
let board: TestStore;
let linked = true;
let tracking = true;
let unavailable = false;
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => sessions }));
vi.mock("../server/blog-store", async (original) => ({ ...await original<typeof import("../server/blog-store")>(), getBlogStore: () => blog }));
vi.mock("../server/portfolio-store", async (original) => { const memory = new (await original<typeof import("../server/portfolio-store")>()).MemoryPortfolioStore(null); return { ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => memory }; });
vi.mock("../server/participation", () => ({ coordinationRequest: async (_action: string, input: { login: string }) => {
  if (unavailable) throw new Error("Membership service is down");
  return { activity: { linked, tracking, login: input.login }, projects: [], help: [], contributions: [] };
} }));

const origin = "https://opencircle.test";
const alice = "a".repeat(64);
const bob = "b".repeat(64);
const admin = "c".repeat(64);
function request(path: string, init: { body?: unknown; token?: string; admin?: boolean; csrf?: boolean; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { origin, ...init.headers };
  if (init.token) headers.cookie = `${init.admin ? "__Host-opencircle_admin" : "opencircle_github"}=${init.token}`;
  if (init.body !== undefined) headers["content-type"] ??= "application/json";
  if (init.admin && init.csrf !== false) headers["x-opencircle-admin"] = "1";
  return new Request(`${origin}${path}`, { method: init.body === undefined ? "GET" : "POST", headers, body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body) });
}
const submit = (token = alice, overrides = {}) => blogApi.POST(request("/api/blog", { token, body: { action: "submit", requestId: randomUUID(), id: randomUUID(), version: 0, content: content(overrides) } }));

beforeEach(async () => {
  linked = true; tracking = true; unavailable = false;
  sessions = new MemoryCommunityStore(null); blog = new LocalBlogStore(null); board = new TestStore();
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret"); vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`); vi.stubEnv("ADMIN_GITHUB_IDS", "1");
  for (const [token, id, login, prefix] of [[alice, 2, "Alice", ""], [bob, 3, "Bob", ""], [admin, 1, "Admin", "admin:"]] as const) {
    await sessions.createSession(createHash("sha256").update(`${prefix}${token}`).digest("hex"), { id, login, avatarUrl: `https://avatars.githubusercontent.com/u/${id}` }, Date.now() + 60_000);
  }
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("serves the published blog to anyone, cacheably and without private fields", async () => {
  const pending = await (await submit()).json();
  const empty = await blogApi.GET(request("/api/blog"));
  expect(empty.status).toBe(200);
  expect(await empty.json()).toMatchObject({ items: [], total: 0 });
  expect(empty.headers.get("cache-control")).toBe("no-cache");
  expect(empty.headers.get("vercel-cdn-cache-control")).toContain("max-age=30");
  const approved = await adminApi.POST(request("/api/blog-admin", { token: admin, admin: true, body: { action: "review", requestId: randomUUID(), id: pending.id, version: pending.version, decision: "approve" } }));
  expect(approved.status).toBe(200);
  const { slug } = await approved.json();
  const read = await blogApi.GET(request(`/api/blog?slug=${slug}`));
  const text = await read.text();
  expect(read.status).toBe(200);
  expect(JSON.parse(text)).toMatchObject({ title: "Shipping my first pull request", body, author: { login: "Alice", portfolioUrl: null } });
  for (const key of ["revision", "audit", "requests", "reviewReason"]) expect(text).not.toContain(`"${key}"`);
  const etag = read.headers.get("etag")!;
  expect((await blogApi.GET(request(`/api/blog?slug=${slug}`, { headers: { "if-none-match": etag } }))).status).toBe(304);
  expect((await blogApi.GET(request("/api/blog?slug=no-such-post"))).status).toBe(404);
  const image = await imageApi.GET(request(`/api/blog-image?slug=${slug}`));
  expect([image.status, image.headers.get("content-type")]).toEqual([200, "image/png"]);
  expect((await imageApi.GET(request("/api/blog-image?slug=no-such-post"))).status).toBe(404);
});

it("lets only signed-in, verified members write", async () => {
  expect(await (await blogApi.POST(request("/api/blog", { body: { action: "submit" } }))).json()).toMatchObject({ error: { code: "github_required" } });
  linked = false;
  expect((await submit()).status).toBe(403);
  linked = true; tracking = false;
  expect((await submit()).status).toBe(503);
  tracking = true; unavailable = true;
  expect(await (await submit()).json()).toMatchObject({ error: { code: "blog_membership_unavailable" } });
  unavailable = false;
  expect((await blogApi.POST(request("/api/blog", { token: alice, body: { action: "submit" }, headers: { origin: "https://evil.test" } }))).status).toBe(403);
  expect((await blogApi.POST(request("/api/blog", { token: alice, body: "{}", headers: { "content-type": "text/plain" } }))).status).toBe(415);
  expect((await blogApi.POST(request("/api/blog", { token: alice, body: "x".repeat(200_001) }))).status).toBe(413);
  const created = await submit();
  expect(created.status).toBe(200);
  expect(created.headers.get("cache-control")).toBe("private, no-store");
});

it("shows each member only their own drafts", async () => {
  const mine = await (await submit()).json();
  const theirs = await (await submit(bob, { title: "Reviewing code kindly" })).json();
  const list = await (await blogApi.GET(request("/api/blog?mine=1", { token: alice }))).json();
  expect(list.items.map((post: { id: string }) => post.id)).toEqual([mine.id]);
  expect((await blogApi.GET(request(`/api/blog?id=${theirs.id}`, { token: alice }))).status).toBe(404);
  expect((await blogApi.GET(request(`/api/blog?id=${mine.id}`, { token: alice }))).status).toBe(200);
  expect((await blogApi.GET(request("/api/blog?mine=1"))).status).toBe(401);
});

it("keeps review behind the admin session and its request header", async () => {
  const pending = await (await submit()).json();
  expect((await adminApi.GET(request("/api/blog-admin?queue=pending"))).status).toBe(401);
  expect((await adminApi.GET(request("/api/blog-admin?queue=pending", { token: alice, admin: true }))).status).toBe(401);
  const queue = await adminApi.GET(request("/api/blog-admin?queue=pending", { token: admin, admin: true }));
  expect((await queue.json()).items.map((post: { id: string }) => post.id)).toEqual([pending.id]);
  expect(await (await adminApi.GET(request("/api/blog-admin", { token: admin, admin: true }))).json()).toMatchObject({ error: { code: "blog_invalid" } });
  const review = { action: "review", requestId: randomUUID(), id: pending.id, version: pending.version, decision: "approve" };
  expect(await (await adminApi.POST(request("/api/blog-admin", { token: admin, admin: true, csrf: false, body: review }))).json()).toMatchObject({ error: { code: "admin_csrf" } });
  expect((await blogApi.POST(request("/api/blog", { token: alice, body: review }))).status).toBe(400);
  expect((await adminApi.POST(request("/api/blog-admin", { token: admin, admin: true, body: review }))).status).toBe(200);
});
