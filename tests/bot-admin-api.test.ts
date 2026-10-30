import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "../api/bot-admin";
import { createAdminSession } from "../server/admin-session";
import { MemoryCommunityStore } from "../server/community-memory";
import { TestStore } from "./helpers/test-store";
import { botAdminFixture } from "./helpers/bot-admin";
import { BOT_ADMIN_MAX_BYTES } from "../shared/bot-admin";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let cookie = "";
const origin = "https://opencircle.test";
const token = "separate-admin-token-at-least-32-characters";
const request = (resource = "state", body?: unknown, extra: Record<string, string> = {}) => new Request(`${origin}/api/bot-admin?resource=${resource}`, { method: body === undefined ? "GET" : "POST", headers: { cookie, origin, "content-type": "application/json", "x-opencircle-admin": "1", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(async () => {
  context.board = new TestStore(); context.community = new MemoryCommunityStore(null);
  for (const [name, value] of Object.entries({ NODE_ENV: "test", ADMIN_GITHUB_IDS: "42", GITHUB_OAUTH_CLIENT_ID: "client", GITHUB_OAUTH_CLIENT_SECRET: "secret", GITHUB_OAUTH_REDIRECT_URI: `${origin}/api/auth-callback`, WHATSAPP_ADMIN_TOKEN: token, WHATSAPP_MEMBERSHIP_TOKEN: "membership-only-token-longer-than-32-chars", WHATSAPP_MEMBERSHIP_URL: "https://wa.opencircle.test/api/v1/membership" })) vi.stubEnv(name, value);
  cookie = (await createAdminSession(request(), context.community as MemoryCommunityStore, { id: 42, login: "organiser", avatarUrl: "" })).split(";", 1)[0];
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("protects every resource and mutation with approved admin, same-origin JSON and the admin header", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  for (const resource of ["state", "status", "groups", "joins"]) expect((await GET(request(resource, undefined, { cookie: "" }))).status).toBe(401);
  const input = { action: "project", id: "one", approve: true };
  const invalidHeaders: Record<string, string>[] = [{ origin: "https://evil.test" }, { "x-opencircle-admin": "" }, { cookie: "" }, { "content-type": "text/plain" }];
  for (const headers of invalidHeaders) expect((await POST(request("state", input, headers))).status).toBeGreaterThanOrEqual(400);
  expect((await GET(request("../../console"))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("uses only the dedicated server credential and strips unrecognised private data recursively", async () => {
  const state = botAdminFixture(true);
  const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...state, secret: "never-expose", members: state.members.map((member) => ({ ...member, secret: "never-expose" })), community: { ...state.community, secret: "never-expose" } })));
  vi.stubGlobal("fetch", upstream);
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  const result = await response.json(); expect(result).toEqual(state); expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(result)).not.toContain("never-expose");
  expect(String(upstream.mock.calls[0][0])).toBe("https://wa.opencircle.test/api/v1/admin/state"); expect(upstream.mock.calls[0][1]).toMatchObject({ headers: { authorization: `Bearer ${token}` }, redirect: "error", method: "GET" });
});

it("normalizes phone, group and join responses and rejects unsafe QR data", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  const status = { state: "connected", account: { name: "Bot", phone: "15550000000" }, qrImage: null, groupJid: "123@g.us" };
  upstream.mockResolvedValueOnce(Response.json({ success: true, data: status })); expect(await (await GET(request("status"))).json()).toEqual(status);
  upstream.mockResolvedValueOnce(Response.json({ success: true, data: [{ jid: "123@g.us", name: "Circle", secret: "private" }] })); expect(await (await GET(request("groups"))).json()).toEqual([{ jid: "123@g.us", name: "Circle" }]);
  upstream.mockResolvedValueOnce(Response.json([{ jid: "1@s.whatsapp.net", secret: "private" }])); expect(await (await GET(request("joins"))).json()).toEqual([{ jid: "1@s.whatsapp.net" }]);
  upstream.mockResolvedValueOnce(Response.json({ success: true, data: { ...status, qrImage: "data:text/html,<script>bad()</script>" } })); expect((await GET(request("status"))).status).toBe(503);
});

it("requires explicit confirmations and rejects unsupported actions before any bot request", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  for (const input of [{ action: "remove", id: "case" }, { action: "phone-unlink" }, { action: "delivery", id: "one", delivered: true }, { action: "repository-review", id: "one", approve: true }, { action: "repository-review", id: "one", approve: false, text: "short" }, { action: "group-mode", open: true, hours: 25, confirmed: true }, { action: "policy", enabled: true }, { action: "project", id: "one", approve: true, secret: "extra" }]) expect((await POST(request("state", input))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
  upstream.mockResolvedValueOnce(Response.json(botAdminFixture()));
  expect((await POST(request("state", { action: "remove", id: "case", confirmed: true }))).status).toBe(200);
  expect(upstream.mock.calls[0][1].body).toBe(JSON.stringify({ action: "remove", id: "case", confirmed: true }));
});

it("fails closed on missing or reused credentials, unsafe URLs, invalid data, oversized responses and upstream failures", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  vi.stubEnv("WHATSAPP_ADMIN_TOKEN", process.env.WHATSAPP_MEMBERSHIP_TOKEN); expect((await GET(request())).status).toBe(503);
  vi.stubEnv("WHATSAPP_ADMIN_TOKEN", token); vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "http://foreign.test/api/v1/membership"); expect((await GET(request())).status).toBe(503); expect(upstream).not.toHaveBeenCalled();
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "https://wa.opencircle.test/api/v1/membership");
  for (const response of [Response.json({ members: [] }), new Response("x".repeat(BOT_ADMIN_MAX_BYTES + 1)), Response.json({ error: "secret detail" }, { status: 500 })]) { upstream.mockResolvedValueOnce(response); const rejected = await GET(request()); expect(rejected.status).toBe(503); expect(await rejected.text()).not.toContain("secret detail"); }
  upstream.mockResolvedValueOnce(Response.json({ error: "This submission was already reviewed." }, { status: 409 })); const stale = await POST(request("state", { action: "project", id: "one", approve: true })); expect(stale.status).toBe(409); expect(await stale.text()).toContain("already reviewed");
});

it("distinguishes an ambiguous mutation outcome from a confirmed rejection without retrying", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  const input = { action: "publish-update", title: "Community help", text: "Try a project and share what you learned." };
  for (const result of [new Error("Timeout"), Response.json({ incomplete: true }), Response.json({ error: "internal detail" }, { status: 500 })]) {
    if (result instanceof Error) upstream.mockRejectedValueOnce(result); else upstream.mockResolvedValueOnce(result);
    const response = await POST(request("state", input)); expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("bot_admin_uncertain");
  }
  expect(upstream).toHaveBeenCalledTimes(3);
});
