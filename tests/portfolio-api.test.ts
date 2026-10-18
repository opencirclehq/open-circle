import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "../api/portfolio";
import { GET as githubGET } from "../api/portfolio-github";
import { POST as uploadPOST } from "../api/portfolio-upload";
import { MemoryCommunityStore } from "../server/community-memory";
import { MemoryPortfolioStore } from "../server/portfolio-store";
import { defaultPortfolio } from "../shared/portfolio";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";
import { createAppServer } from "../server/node-server";

let community: MemoryCommunityStore;
let portfolios: MemoryPortfolioStore;
let board: TestStore;
vi.mock("../server/community-store", () => ({ getCommunityStore: () => community }));
vi.mock("../server/portfolio-store", async (original) => ({ ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => portfolios }));
vi.mock("../server/db", () => ({ getStore: () => board }));
const profile = { id: 42, login: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/42" };
const token = "a".repeat(64);
const content = () => ({ ...defaultPortfolio(profile), displayName: "Alice Chen" });
function req(body?: unknown, origin = "https://opencircle.test", cookie = token) {
  return new Request("https://opencircle.test/api/portfolio", { method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json", cookie: `opencircle_github=${cookie}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function repo(id = 100, ownerId = 42, privateRepo = false) {
  return { id, name: "useful-project", full_name: "Alice/useful-project", owner: { id: ownerId, login: "Alice" }, private: privateRepo, description: "A useful public project.", language: "TypeScript", stargazers_count: 12, forks_count: 2, homepage: "https://example.com", default_branch: "main" };
}
beforeEach(async () => {
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret"); vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "https://opencircle.test/api/auth-callback");
  community = new MemoryCommunityStore(null); portfolios = new MemoryPortfolioStore(null); board = new TestStore();
  await community.createSession(createHash("sha256").update(token).digest("hex"), profile, Date.now() + 60_000);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requires a session, same-origin JSON and the canonical editor origin", async () => {
  expect((await GET(req(undefined, undefined, ""))).status).toBe(401);
  expect((await POST(req({ action: "save", content: content(), version: 0 }, "https://foreign.test"))).status).toBe(403);
  const sibling = req({ action: "save", content: content(), version: 0 }); sibling.headers.set("sec-fetch-site", "same-site");
  expect((await POST(sibling)).status).toBe(403);
  const wrong = new Request("https://alice.opencircle.cc/api/portfolio", { method: "POST", headers: { origin: "https://alice.opencircle.cc", "content-type": "application/json", cookie: `opencircle_github=${token}` }, body: JSON.stringify({ action: "save", content: content(), version: 0 }) });
  expect((await POST(wrong)).status).toBe(403);
  const state = await GET(req()); expect(state.status).toBe(200); expect(state.headers.get("cache-control")).toBe("private, no-store");
  expect(await state.json()).toMatchObject({ profile: { id: 42 }, version: 0, draft: { contacts: [], primaryContact: "none" } });
});

it("grants the portfolio achievement to a board member on publish", async () => {
  await board.createMember(memberRecord({ login: "alice", displayLogin: "Alice", activityDays: ["2026-10-14"] }));
  expect((await POST(req({ action: "publish", content: content(), version: 0 }))).status).toBe(200);
  expect((await board.getMember("alice"))?.achievements).toMatchObject({ portfolio_author: expect.any(Number) });
});

it("keeps a successful publish when recording the achievement fails, and recovers on the next read", async () => {
  await board.createMember(memberRecord({ login: "alice", displayLogin: "Alice", activityDays: ["2026-10-14"] }));
  const failing = vi.spyOn(board, "mergeAchievements").mockRejectedValueOnce(new Error("storage hiccup"));

  const publish = await POST(req({ action: "publish", content: content(), version: 0 }));
  expect(publish.status).toBe(200);
  expect(await publish.json()).toMatchObject({ version: 1, publishedAt: expect.any(Number) });
  expect((await board.getMember("alice"))?.achievements?.portfolio_author).toBeUndefined();

  failing.mockRestore();
  expect((await GET(req())).status).toBe(200);
  expect((await board.getMember("alice"))?.achievements).toMatchObject({ portfolio_author: expect.any(Number) });
});

it("accepts long README drafts, isolates live data and rejects lost updates", async () => {
  const draft = { ...content(), readme: "Useful writing. ".repeat(700), contacts: [{ kind: "whatsapp", value: "+2348031234567", visible: false }] };
  expect((await POST(req({ action: "save", content: draft, version: 0, ownerId: 999 }))).status).toBe(200);
  expect(await portfolios.readOwner(999)).toBeNull();
  expect((await GET(new Request("https://opencircle.test/api/portfolio?slug=alice"))).status).toBe(404);
  const published = await POST(req({ action: "publish", content: draft, version: 1 })); expect(published.status).toBe(200);
  const publicResponse = await GET(new Request("https://opencircle.test/api/portfolio?slug=alice"));
  expect(publicResponse.status).toBe(200); expect(publicResponse.headers.get("cache-control")).toBe("no-store");
  const json = await publicResponse.text(); expect(json).not.toContain("2348031234567"); expect(json).not.toContain('"draft"'); expect(json).not.toContain('"ownerId"');
  expect((await POST(req({ action: "save", content: { ...draft, displayName: "Private name" }, version: 2 }))).status).toBe(200);
  expect(await (await GET(new Request("https://opencircle.test/api/portfolio?slug=alice"))).json()).toMatchObject({ displayName: "Alice Chen" });
  expect((await POST(req({ action: "publish", content: draft, version: 2 }))).status).toBe(409);
  expect((await POST(req({ action: "unpublish", version: 3 }))).status).toBe(200);
  expect((await GET(new Request("https://opencircle.test/api/portfolio?slug=alice"))).status).toBe(404);
});

it("rechecks repository visibility and immutable account ownership when publishing", async () => {
  const project = { repository: { id: 100, name: "forged-name", fullName: "Eve/private", description: "fake", language: "fake", stars: 999, forks: 0, url: "https://evil.test", homepage: "" }, title: "My project", summary: "A custom story", imageUrl: "" };
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(repo(100, 99))));
  expect((await POST(req({ action: "publish", content: { ...content(), projects: [project] }, version: 0 }))).status).toBe(400);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(repo(100, 42, true))));
  expect((await POST(req({ action: "publish", content: { ...content(), projects: [project] }, version: 0 }))).status).toBe(400);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(repo())));
  expect((await POST(req({ action: "publish", content: { ...content(), projects: [project] }, version: 0 }))).status).toBe(200);
  const published = await (await GET(new Request("https://opencircle.test/api/portfolio?slug=alice"))).json();
  expect(published.projects[0]).toMatchObject({ title: "My project", summary: "A custom story", repository: { fullName: "Alice/useful-project", stars: 12, url: "https://github.com/Alice/useful-project" } });
  expect(JSON.stringify(published)).not.toContain("evil.test");
});

it("paginates public repositories and imports a bounded README from an owned repository", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify([repo(), repo(101, 999), repo(102, 42, true)]), { headers: { link: '<https://api.github.com/users/Alice/repos?page=2>; rel="next"' } }));
  const request = (query: string) => new Request(`https://opencircle.test/api/portfolio-github?${query}`, { headers: { cookie: `opencircle_github=${token}` } });
  const listed = await (await githubGET(request("page=1"))).json(); expect(listed.repositories).toHaveLength(1); expect(listed.nextPage).toBe(2);
  expect((await githubGET(request("page=0"))).status).toBe(400);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(repo()))).mockResolvedValueOnce(new Response(JSON.stringify({ encoding: "base64", content: Buffer.from("## About\n![Preview](images/preview.png)").toString("base64") }))).mockResolvedValueOnce(new Response(JSON.stringify(repo())));
  const imported = await githubGET(request("readme=100")); expect(imported.status).toBe(200);
  expect((await imported.json()).readme).toContain("https://raw.githubusercontent.com/Alice/useful-project/main/images/preview.png");
});

it("keeps upload credentials out of responses and requires sign-in before uploads", async () => {
  const response = await uploadPOST(new Request("https://opencircle.test/api/portfolio-upload", { method: "POST", headers: { origin: "https://opencircle.test", "content-type": "image/png" }, body: "bad" }));
  expect(response.status).toBe(401);
  vi.stubEnv("R2_ACCOUNT_ID", "");
  const unavailable = await uploadPOST(new Request("https://opencircle.test/api/portfolio-upload", { method: "POST", headers: { origin: "https://opencircle.test", "content-type": "image/png", cookie: `opencircle_github=${token}` }, body: "bad" }));
  expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("test-secret");
});

it("serves long drafts, publication, tenant HTML and unpublishing through the real Node HTTP adapter", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "opencircle-portfolio-http-"));
  writeFileSync(path.join(directory, "index.html"), '<html><head><title>Board</title></head><body><div id="root"></div></body></html>');
  const server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
    const base = `http://127.0.0.1:${address.port}`;
    vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${base}/api/auth-callback`); vi.stubEnv("PORTFOLIO_SUBDOMAINS_ENABLED", "1");
    const headers = { origin: base, "content-type": "application/json", cookie: `opencircle_github=${token}` };
    const draft = { ...content(), readme: "A longer README. ".repeat(1000) };
    expect((await fetch(`${base}/api/portfolio`, { method: "POST", headers, body: JSON.stringify({ action: "save", content: draft, version: 0 }) })).status).toBe(200);
    expect((await fetch(`${base}/p/alice`)).status).toBe(404);
    expect((await fetch(`${base}/api/portfolio`, { method: "POST", headers, body: JSON.stringify({ action: "publish", content: draft, version: 1 }) })).status).toBe(200);
    const page = await new Promise<{ status: number | undefined; cache: string | undefined; html: string }>((resolve, reject) => {
      httpRequest(`${base}/`, { headers: { host: "alice.opencircle.cc" } }, (response) => {
        const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => resolve({ status: response.statusCode, cache: response.headers["cache-control"], html: Buffer.concat(chunks).toString("utf8") }));
      }).on("error", reject).end();
    });
    expect(page.status).toBe(200); expect(page.cache).toBe("no-store");
    expect(page.html).toContain("<title>Alice Chen</title>"); expect(page.html).toContain('href="https://alice.opencircle.cc"');
    const tooLarge = await fetch(`${base}/api/portfolio`, { method: "POST", headers, body: JSON.stringify({ payload: "x".repeat(128_001) }) }); expect(tooLarge.status).toBe(413);
    expect((await fetch(`${base}/api/portfolio`, { method: "POST", headers, body: JSON.stringify({ action: "unpublish", version: 2 }) })).status).toBe(200);
    const hidden = await fetch(`${base}/p/alice`); expect(hidden.status).toBe(404); expect(hidden.headers.get("x-robots-tag")).toContain("noindex");
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((failure) => failure ? reject(failure) : resolve())); rmSync(directory, { recursive: true, force: true });
  }
});

it("returns from OAuth to the portfolio editor without allowing arbitrary redirects", async () => {
  const { beginGitHubSignIn, finishGitHubSignIn } = await import("../server/github-auth");
  for (const returnTo of ["/portfolio", "https://foreign.test/portfolio"]) {
    const start = beginGitHubSignIn(new Request(`https://opencircle.test/api/auth-start?returnTo=${encodeURIComponent(returnTo)}`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test", token_type: "bearer" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, login: "Alice", type: "User" }))));
    const result = await finishGitHubSignIn(new Request(`https://opencircle.test/api/auth-callback?code=code&state=${state}`, { headers: { cookie: start.headers.get("set-cookie")!.split(";")[0] } }), community);
    expect(result.headers.get("location")).toBe(returnTo === "/portfolio" ? "/portfolio" : "/tools");
  }
});
