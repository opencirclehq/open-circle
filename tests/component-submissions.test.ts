import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteSubmission, GET as listSubmissions, PATCH as reviewSubmission, POST as submit } from "../api/components";
import { createAdminSession } from "../server/admin-session";
import { MemoryCommunityStore } from "../server/community-memory";
import { MemoryComponentSubmissionStore } from "../server/component-submissions";
import type { ComponentSubmission } from "../shared/components";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown, submissions: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
vi.mock("../server/component-submissions", async (load) => ({
  ...await load<typeof import("../server/component-submissions")>(),
  getComponentSubmissionStore: () => context.submissions,
}));

const component = { name: "Glass Tabs", category: "Navigation", tags: "tabs, glass", dependencies: "motion", link: "", source: "export function GlassTabs() {\n  return null;\n}", usage: "<GlassTabs />" };
const visitorCookie = `opencircle_visitor=${"c".repeat(64)}`;
const githubToken = "a".repeat(64);
let adminCookie: string;

function request(method: string, body?: unknown, cookie = visitorCookie) {
  return new Request("https://opencircle.test/api/components", {
    method,
    headers: { "x-opencircle-admin": "1", "content-type": "application/json", origin: "https://opencircle.test", "x-vercel-forwarded-for": "203.0.113.9", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  const community = new MemoryCommunityStore(null);
  context.board = new TestStore();
  context.community = community;
  context.submissions = new MemoryComponentSubmissionStore(null);
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "https://opencircle.test/api/auth-callback");
  vi.stubEnv("ADMIN_GITHUB_IDS", "1");
  await community.createSession(createHash("sha256").update(githubToken).digest("hex"), { id: 7, login: "maker", avatarUrl: "https://avatars.githubusercontent.com/u/7" }, Date.now() + 60_000);
  adminCookie = (await createAdminSession(request("GET"), community, { id: 1, login: "octocat", avatarUrl: "" })).split(";", 1)[0];
});

afterEach(() => vi.unstubAllEnvs());

describe("component submissions API", () => {
  it("accepts a submission from anyone, credits a signed-in member and blocks the same name twice", async () => {
    const created = await submit(request("POST", { ...component, status: "accepted" }, `${visitorCookie}; opencircle_github=${githubToken}`));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ status: "pending" });
    const duplicate = await submit(request("POST", { ...component, name: "glass tabs!" }));
    expect(duplicate.status).toBe(409);

    const [stored] = await (context.submissions as MemoryComponentSubmissionStore).list();
    expect(stored).toMatchObject({ name: "Glass Tabs", slug: "glass-tabs", tags: ["tabs", "glass"], dependencies: ["motion"], source: component.source, usage: component.usage, status: "pending", submitter: { login: "maker" } });
  });

  it("rejects invalid input and visitors without a cookie", async () => {
    expect((await submit(request("POST", { ...component, source: "" }))).status).toBe(400);
    expect((await submit(request("POST", component, ""))).status).toBe(409);
  });

  it("rate limits a visitor after five submissions an hour", async () => {
    for (let index = 0; index < 5; index++)
      expect((await submit(request("POST", { ...component, name: `Glass Tabs ${index}` }))).status).toBe(201);
    expect((await submit(request("POST", { ...component, name: "Glass Tabs 6" }))).status).toBe(429);
  });

  it("keeps the queue admin-only and records who reviewed what", async () => {
    await submit(request("POST", component));
    expect((await listSubmissions(request("GET"))).status).toBe(401);
    const [pending] = await (await listSubmissions(request("GET", undefined, adminCookie))).json() as ComponentSubmission[];
    expect(pending.status).toBe("pending");

    expect((await reviewSubmission(request("PATCH", { id: pending.id, status: "accepted" }))).status).toBe(401);
    expect((await reviewSubmission(request("PATCH", { id: pending.id, status: "published" }, adminCookie))).status).toBe(400);
    const accepted = await reviewSubmission(request("PATCH", { id: pending.id, status: "accepted" }, adminCookie));
    expect(await accepted.json()).toMatchObject({ status: "accepted", reviewer: "octocat" });
    const reopened = await (await reviewSubmission(request("PATCH", { id: pending.id, status: "pending" }, adminCookie))).json() as ComponentSubmission;
    expect(reopened.reviewer).toBeUndefined();

    expect((await deleteSubmission(request("DELETE", { id: pending.id }, adminCookie))).status).toBe(200);
    expect(await (await listSubmissions(request("GET", undefined, adminCookie))).json()).toEqual([]);
    // Deleting frees the name to be sent again.
    expect((await submit(request("POST", component))).status).toBe(201);
  });

  it("takes a full component file, well past the default request size", async () => {
    const source = `export function Big() {\n${"  // line\n".repeat(4000)}  return null;\n}`;
    expect((await submit(request("POST", { ...component, source }))).status).toBe(201);
  });
});
