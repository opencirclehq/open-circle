import { botAdminFixture } from "./helpers/bot-admin";
import { defaultBotOptions, defaultBotMessages } from "../shared/bot-settings";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminState } from "../shared/types";
import Admin from "../src/pages/Admin";
import { api, ApiError } from "../src/lib/api";
import { boardFixture, publicMember } from "./helpers/fixtures";
import { emptyTraffic } from "../server/analytics-store";

vi.mock("../src/lib/api", async (original) => ({
  ...await original<typeof import("../src/lib/api")>(),
  api: { botAdmin: vi.fn(), adminSession: vi.fn(), adminSignOut: vi.fn(), adminState: vi.fn(), adminAction: vi.fn(), adminTools: vi.fn(), botSettings: vi.fn(), adminAnalytics: vi.fn() },
}));
vi.mock("../src/components/board/tool-moderation", () => ({ ToolModeration: () => <p>Tool review queue</p> }));

const clients: QueryClient[] = [];
const profile = { id: 1, login: "organiser", avatarUrl: "" };
let state: AdminState;

beforeEach(() => {
  sessionStorage.clear();
  const board = boardFixture();
  state = {
    config: { invite: board.invite, weights: board.weights },
    members: [{
      ...publicMember({ nickname: "A".repeat(24), login: "developer-with-a-long-github-username", rank: 4, score: 1_234_567 }),
      whatsapp: "+447700900123", hidden: false, createdAt: Date.now(), statsUpdatedAt: Date.now(),
    }],
  };
  vi.mocked(api.botAdmin).mockReset().mockResolvedValue(botAdminFixture());
  vi.mocked(api.adminSession).mockReset().mockResolvedValue({ configured: true, profile });
  vi.mocked(api.adminSignOut).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(api.adminState).mockReset().mockResolvedValue(state);
  vi.mocked(api.adminAction).mockReset();
  vi.mocked(api.botSettings).mockReset().mockResolvedValue({ version: 1, policy: { enabled: true, timezone: "Africa/Lagos", welcomeTimes: ["09:00", "14:00", "19:00"], quietStart: 22, quietEnd: 8, graceDays: 14, target: 4, reviewPeers: 2, periodDays: 28, reminderDays: 14, warningDays: 21, removalDays: 28 }, community: { groupSchedule: false, summariesEnabled: false, mentorMatching: false, sessionsEnabled: false, summaryTime: "19:00", announcementsJid: "", mentorWaitHours: 24, helpDay: 3, helpTime: "18:00", demoDay: 5, demoTime: "18:00", sessionMinutes: 60 }, options: defaultBotOptions(), messages: defaultBotMessages(), status: { connected: true, botAdmin: true, groupOpen: true, tracking: true, announced: true, lastCheckAt: Date.now(), pendingWelcomes: 0, uncertainDeliveries: 0, consoleUrl: "https://wa.opencircle.test" } });
  vi.mocked(api.adminTools).mockReset().mockResolvedValue([]);
  vi.mocked(api.adminAnalytics).mockReset().mockResolvedValue({ days: 30, generatedAt: Date.now(), startedAt: null, current: { ...emptyTraffic(), daily: [{ date: "2026-10-15", visitors: 0, pageViews: 0 }] }, previous: null, growth: { members: 0, previousMembers: 0, toolSubmissions: 0, previousToolSubmissions: 0, pendingTools: 0 } });
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  sessionStorage.clear();
});

function renderAdmin(path = "/admin") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Admin /></MemoryRouter></QueryClientProvider>);
  return { client, ...view };
}

describe("Admin access and management", () => {
  it("preserves unsaved bot changes across outer admin tab switches", async () => {

    renderAdmin(); const user = userEvent.setup(); await user.click(await screen.findByRole("tab", { name: "Settings" }));
    await user.click(await screen.findByRole("switch", { name: "Tag newcomers" }));
    await user.click(screen.getByRole("tab", { name: "Members" })); expect(screen.queryByRole("switch", { name: "Tag newcomers" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Settings" })); expect(screen.getByRole("switch", { name: "Tag newcomers" }).getAttribute("aria-checked")).toBe("false"); expect(screen.getByText("Unsaved bot changes")).toBeTruthy();
  });

  it("paginates private member records and returns to the first page when searching", async () => {
    state.members = Array.from({ length: 45 }, (_, index) => ({ ...state.members[0], login: `member-${index}`, nickname: `Member ${index}`, rank: index + 1 }));
    vi.mocked(api.adminState).mockResolvedValue(state);
    renderAdmin();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Members" }));
    const nav = () => within(screen.getByRole("navigation", { name: "Members pagination" }));
    expect(within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem")).toHaveLength(20);
    await user.click(nav().getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Hide Member 20" })).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: "Search members" }), "Member 1");
    expect(screen.getByRole("button", { name: "Hide Member 1" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Members pagination" })).toBeNull();
  });

  it("shows GitHub sign-in without requesting private data or using a stored legacy secret", async () => {
    sessionStorage.setItem("devechleon:admin", "old-secret");
    vi.mocked(api.adminSession).mockResolvedValue({ configured: true, profile: null });
    renderAdmin("/admin?signin=admin_forbidden");
    expect((await screen.findByRole("link", { name: "Continue with GitHub" })).getAttribute("href")).toBe("/api/auth-start?returnTo=%2Fadmin");
    expect(screen.getByRole("alert").textContent).toContain("doesn't have admin access");
    expect(api.adminState).not.toHaveBeenCalled();
    expect(api.adminTools).not.toHaveBeenCalled();
    expect(api.adminAnalytics).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("devechleon:admin")).toBeNull();
  });

  it("keeps admin disabled until it is configured and offers recovery from an access-check failure", async () => {
    vi.mocked(api.adminSession).mockRejectedValueOnce(new Error("Connection unavailable")).mockResolvedValue({ configured: false, profile: null });
    renderAdmin();
    expect((await screen.findByRole("alert")).textContent).toBe("Connection unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/Admin access hasn't been set up/);
    expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
    expect(api.adminState).not.toHaveBeenCalled();
  });

  it("hides and restores members, then clears private data and cached queries on sign-out", async () => {
    const { client } = renderAdmin();
    const user = userEvent.setup();
    const name = state.members[0].nickname;
    await user.click(await screen.findByRole("tab", { name: "Members" }));
    const hide = await screen.findByRole("button", { name: `Hide ${name}` });
    const row = hide.closest("li")!;
    expect(within(row).getByText("+447700900123")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "@developer-with-a-long-github-username" }).getAttribute("href")).toBe("https://github.com/developer-with-a-long-github-username");
    const hidden = { ...state, members: [{ ...state.members[0], hidden: true }] };
    vi.mocked(api.adminAction).mockResolvedValueOnce(hidden).mockResolvedValueOnce(state);
    await user.click(hide);
    expect(api.adminAction).toHaveBeenCalledWith({ action: "hide", login: state.members[0].login });
    await user.click(await screen.findByRole("button", { name: `Show ${name}` }));
    expect(api.adminAction).toHaveBeenLastCalledWith({ action: "unhide", login: state.members[0].login });
    await screen.findByRole("button", { name: `Hide ${name}` });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(api.adminSignOut).toHaveBeenCalled();
    expect(screen.queryByText("+447700900123")).toBeNull();
    expect(client.getQueryData(["admin", "state"])).toBeUndefined();
    expect(client.getQueryData(["admin", "tools"])).toBeUndefined();
  });

  it("searches members and requires confirmation before removing one", async () => {
    renderAdmin();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Members" }));
    const search = await screen.findByRole("searchbox", { name: "Search members" });
    await user.type(search, "missing person");
    await screen.findByText("No members match these filters.");
    await user.clear(search);
    await user.type(search, "900123");
    const remove = screen.getByRole("button", { name: `Remove ${state.members[0].nickname}` });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(remove);
    expect(api.adminAction).not.toHaveBeenCalled();
    vi.mocked(api.adminAction).mockResolvedValue({ ...state, members: [] });
    await user.click(remove);
    await screen.findByText("No one has registered yet.");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.adminAction).toHaveBeenCalledWith({ action: "remove", login: state.members[0].login });
  });

  it("saves edited invite settings and ranking weights", async () => {
    renderAdmin();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Settings" }));
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
    const invite = screen.getByRole("textbox", { name: "WhatsApp invite link" });
    await user.clear(invite);
    await user.type(invite, "https://chat.whatsapp.com/newgroup");
    const weight = screen.getByRole("spinbutton", { name: "Per star" });
    expect(screen.getByRole("spinbutton", { name: "Per contribution since joining" })).toBeTruthy();
    const upvotes = screen.getByRole("spinbutton", { name: "Points per repo upvote" });
    await user.clear(upvotes);
    await user.type(upvotes, "2");
    await user.clear(weight);
    await user.type(weight, "7");
    vi.mocked(api.adminAction).mockResolvedValueOnce(state);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(api.adminAction).toHaveBeenCalledWith({
      action: "config",
      config: { invite: { ...state.config.invite, url: "https://chat.whatsapp.com/newgroup" }, weights: { ...state.config.weights, stars: 7, upvotes: 2 } },
    }));
  });

  it("removes private data when a session expires during a change", async () => {
    const { client } = renderAdmin();
    vi.mocked(api.adminAction).mockRejectedValue(new ApiError(401, "unauthorized", "Sign in again."));
    await userEvent.click(await screen.findByRole("tab", { name: "Members" }));
    await userEvent.click(await screen.findByRole("button", { name: `Hide ${state.members[0].nickname}` }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(screen.queryByText("+447700900123")).toBeNull();
    expect(client.getQueryData(["admin", "state"])).toBeUndefined();
  });

  it("clears private analytics when the admin signs out", async () => {
    const { client } = renderAdmin();
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    expect(client.getQueryData(["admin", "analytics", 30])).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(client.getQueryData(["admin", "analytics", 30])).toBeUndefined();
    expect(screen.queryByRole("img", { name: /Daily unique visitors/ })).toBeNull();
  });
});
