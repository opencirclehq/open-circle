import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "../api/bot-settings";
import { createAdminSession } from "../server/admin-session";
import { MemoryCommunityStore } from "../server/community-memory";
import { TestStore } from "./helpers/test-store";
import { defaultBotOptions, defaultBotMessages, BOT_SETTINGS_MAX_BYTES, type BotSettingsState } from "../shared/bot-settings";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let cookie = "";
let state: BotSettingsState;
const origin = "https://opencircle.test";
const token = "dedicated-admin-token-longer-than-32-characters";
const request = (method = "GET", body?: unknown, extra: Record<string, string> = {}) => new Request(`${origin}/api/bot-settings`, { method, headers: { cookie, origin, "content-type": "application/json", "x-opencircle-admin": "1", "x-vercel-forwarded-for": "203.0.113.10", ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(async () => {
  context.board = new TestStore(); context.community = new MemoryCommunityStore(null);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("ADMIN_GITHUB_IDS", "42"); vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret"); vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`); vi.stubEnv("WHATSAPP_ADMIN_TOKEN", token); vi.stubEnv("WHATSAPP_MEMBERSHIP_TOKEN", "membership-token-must-not-grant-admin-access"); vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "https://wa.opencircle.test/api/v1/membership");
  cookie = (await createAdminSession(request(), context.community as MemoryCommunityStore, { id: 42, login: "organiser", avatarUrl: "" })).split(";", 1)[0];
  state = { version: 0, policy: { enabled: true, timezone: "Africa/Lagos", welcomeTimes: ["09:00", "14:00", "19:00"], quietStart: 22, quietEnd: 8, graceDays: 14, target: 4, reviewPeers: 2, periodDays: 28, reminderDays: 14, warningDays: 21, removalDays: 28 }, community: { groupSchedule: false, summariesEnabled: false, mentorMatching: false, sessionsEnabled: false, summaryTime: "19:00", announcementsJid: "", mentorWaitHours: 24, helpDay: 3, helpTime: "18:00", demoDay: 5, demoTime: "18:00", sessionMinutes: 60 }, options: defaultBotOptions(), messages: defaultBotMessages(), status: { connected: true, botAdmin: true, groupOpen: true, tracking: true, announced: true, lastCheckAt: Date.now(), pendingWelcomes: 1, uncertainDeliveries: 0, consoleUrl: "https://untrusted.example" } };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("loads and saves supported settings when the bot has no weekly enforcement capability", async () => {
  delete state.options.weeklyEngagementEnforcement;
  const upstream = vi.fn().mockImplementation(async () => Response.json(state)); vi.stubGlobal("fetch", upstream);
  const loaded = await GET(request()); expect(loaded.status).toBe(200); const legacy = await loaded.json();
  expect(legacy.options).not.toHaveProperty("weeklyEngagementEnforcement");
  legacy.options.welcomeTagging = false;
  const saved = await POST(request("POST", legacy)); expect(saved.status).toBe(200);
  const sent = JSON.parse(upstream.mock.calls[1][1].body); expect(sent.options.welcomeTagging).toBe(false); expect(sent.options).not.toHaveProperty("weeklyEngagementEnforcement");
  const incomplete = structuredClone(state) as Omit<BotSettingsState, "options"> & { options: Partial<BotSettingsState["options"]> }; delete incomplete.options.welcomeTagging;
  upstream.mockResolvedValueOnce(Response.json(incomplete)); expect((await GET(request())).status).toBe(503);
});

it("requires an approved admin and the correct origin before contacting the bot", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  expect((await GET(request("GET", undefined, { cookie: "" }))).status).toBe(401);
  expect((await POST(request("POST", state, { origin: "https://foreign.test" }))).status).toBe(403);
  expect((await POST(request("POST", state, { "x-opencircle-admin": "" }))).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("uses the separate server-only credential, supports full message formats and strips unexpected private fields", async () => {
  const upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ...state, password: "never-expose", status: { ...state.status, password: "never-expose" }, policy: { ...state.policy, token: "never-expose" } }))); vi.stubGlobal("fetch", upstream);
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); const result = await response.json(); expect(result.status.consoleUrl).toBe("https://wa.opencircle.test"); expect(JSON.stringify(result)).not.toContain("never-expose"); expect(JSON.stringify(result)).not.toContain(token);
  state.messages.welcomeGreeting = "A".repeat(5900); expect((await POST(request("POST", state))).status).toBe(200);
  expect(String(upstream.mock.calls[0][0])).toBe("https://wa.opencircle.test/api/v1/settings"); expect(upstream.mock.calls[0][1].headers.authorization).toBe(`Bearer ${token}`); expect(upstream.mock.calls[0][1].redirect).toBe("error"); expect(upstream.mock.calls[1][1].method).toBe("POST");
});

it("fails closed for missing or shared admin credentials and unsafe bot endpoints", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  for (const value of ["", "short", process.env.WHATSAPP_MEMBERSHIP_TOKEN!]) { vi.stubEnv("WHATSAPP_ADMIN_TOKEN", value); expect((await GET(request())).status).toBe(503); }
  vi.stubEnv("WHATSAPP_ADMIN_TOKEN", token);
  for (const value of ["http://remote.example/api/v1/membership", "https://user:secret@wa.example/api/v1/membership", "https://wa.example/other", "https://wa.example/api/v1/membership?secret=1"]) { vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", value); expect((await GET(request())).status).toBe(503); }
  expect(upstream).not.toHaveBeenCalled();
});

it("preserves useful validation and conflict errors but hides upstream failures and malformed payloads", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  upstream.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Another admin changed these settings." }), { status: 409 })); const conflict = await POST(request("POST", state)); expect(conflict.status).toBe(409); expect((await conflict.json()).error.message).toContain("Another admin");
  upstream.mockResolvedValueOnce(new Response(JSON.stringify({ error: "private implementation secret" }), { status: 500 })); const failed = await GET(request()); expect(failed.status).toBe(503); expect(JSON.stringify(await failed.json())).not.toContain("private implementation secret");
  upstream.mockResolvedValueOnce(new Response(JSON.stringify({ ...state, options: {} }))); expect((await GET(request())).status).toBe(503);
  upstream.mockResolvedValueOnce(new Response("x".repeat(BOT_SETTINGS_MAX_BYTES + 8193))); expect((await GET(request())).status).toBe(503);
  expect((await POST(request("POST", { huge: "x".repeat(BOT_SETTINGS_MAX_BYTES) }))).status).toBe(413);
});
