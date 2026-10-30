import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BotAdminResource, BotAdminResponses } from "../shared/bot-admin";
import Admin from "../src/pages/Admin";
import { api, ApiError } from "../src/lib/api";
import { BOT_ADMIN_KEY } from "../src/hooks/use-bot-admin";
import { botAdminFixture } from "./helpers/bot-admin";
import { boardFixture } from "./helpers/fixtures";
import { emptyTraffic } from "../server/analytics-store";

vi.mock("../src/lib/api", async (original) => ({ ...await original<typeof import("../src/lib/api")>(), api: { adminSession: vi.fn(), adminState: vi.fn(), adminTools: vi.fn(), adminAnalytics: vi.fn(), adminSignOut: vi.fn(), botAdmin: vi.fn(), botAdminAction: vi.fn() } }));
const clients: QueryClient[] = [];
const profile = { id: 42, login: "organiser", avatarUrl: "" };
let state = botAdminFixture(true);
const connection = { state: "connected", account: { name: "Circle bot", phone: "15550000000" }, qrImage: null, groupJid: "123@g.us" };

beforeEach(() => {
  state = botAdminFixture(true);
  const board = boardFixture();
  vi.mocked(api.adminSession).mockReset().mockResolvedValue({ configured: true, profile });
  vi.mocked(api.adminState).mockReset().mockResolvedValue({ config: { invite: board.invite, weights: board.weights }, members: [] });
  vi.mocked(api.adminTools).mockReset().mockResolvedValue([]);
  vi.mocked(api.adminSignOut).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(api.adminAnalytics).mockReset().mockResolvedValue({ days: 30, generatedAt: Date.now(), startedAt: null, current: { ...emptyTraffic(), daily: [{ date: "2026-10-30", visitors: 0, pageViews: 0 }] }, previous: null, growth: { members: 0, previousMembers: 0, toolSubmissions: 0, previousToolSubmissions: 0, pendingTools: 0 } });
  vi.mocked(api.botAdmin).mockReset().mockImplementation(async <K extends BotAdminResource>(resource: K): Promise<BotAdminResponses[K]> => ({ state, status: connection, groups: [{ jid: "123@g.us", name: "OpenCircle" }], joins: [{ jid: "15550000002@s.whatsapp.net" }] })[resource]);
  vi.mocked(api.botAdminAction).mockReset().mockResolvedValue(state);
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
function mount(section = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin${section ? `?section=${section}` : ""}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Admin /></MemoryRouter></QueryClientProvider>);
  return client;
}
async function dialogSubmit(user: ReturnType<typeof userEvent.setup>, label: string) { await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: label })); }

it("exposes pending repository counts and takes Overview straight to licence-gated approval", async () => {
  const next = structuredClone(state); next.community!.repositories[0].status = "approved";
  vi.mocked(api.botAdminAction).mockResolvedValue(next);
  mount(); const user = userEvent.setup();
  await screen.findByText(/1 repos awaiting review/);
  expect(screen.getByRole("tab", { name: "Repositories (1)" })).toBeTruthy();
  for (const label of ["WhatsApp", "Website", "Configuration"]) expect(screen.getByRole("group", { name: label })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Review repositories/ }));
  await screen.findByRole("heading", { name: "Repositories" });
  expect(screen.getByText("Help test the keyboard shortcuts.")).toBeTruthy(); expect(screen.getByRole("link", { name: "https://github.com/Alice/tool/issues/1" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Approve repository" }));
  const dialog = within(screen.getByRole("dialog"));
  expect((dialog.getByRole("button", { name: "Approve repository" }) as HTMLButtonElement).disabled).toBe(true);
  expect(api.botAdminAction).not.toHaveBeenCalled();
  await user.click(dialog.getByRole("checkbox")); await dialogSubmit(user, "Approve repository");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "repository-review", id: "repo_1", approve: true, licenseConfirmed: true });
  await waitFor(() => expect(screen.getByRole("tab", { name: "Repositories" })).toBeTruthy());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", { name: "Repositories queue" })));
});

it("preserves a failed return reason and retries without losing the admin's draft", async () => {
  vi.mocked(api.botAdminAction).mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValueOnce(state);
  mount("repositories"); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Return submission" }));
  const reason = within(screen.getByRole("dialog")).getByRole("textbox", { name: /Reason for the member/ });
  await user.type(reason, "Please add clear starter tasks for contributors."); await dialogSubmit(user, "Return submission");
  await screen.findByText("Connection interrupted"); expect((reason as HTMLTextAreaElement).value).toContain("clear starter tasks");
  await dialogSubmit(user, "Return submission"); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "repository-review", id: "repo_1", approve: false, text: "Please add clear starter tasks for contributors." });
});

it("searches and paginates all repository submissions instead of hiding records beyond the first page", async () => {
  state.community!.repositories = Array.from({ length: 24 }, (_, index) => ({ ...state.community!.repositories[0], id: `repo_${index}`, fullName: `Alice/project-${index}`, url: `https://github.com/Alice/project-${index}`, createdAt: index }));
  mount("repositories"); const user = userEvent.setup();
  const list = await screen.findByRole("list", { name: "Repositories" }); expect(within(list).getAllByRole("listitem")).toHaveLength(10);
  await user.click(within(screen.getByRole("navigation", { name: "Repositories pagination" })).getByRole("button", { name: "Next" }));
  await user.type(screen.getByRole("searchbox", { name: "Search repositories" }), "project-23");
  expect(screen.getByRole("link", { name: "Alice/project-23" })).toBeTruthy(); expect(screen.queryByRole("navigation", { name: "Repositories pagination" })).toBeNull();
});

it("confirms feedback and requires a reason before revoking previously confirmed credit", async () => {
  mount("feedback"); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Confirm useful" }));
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "contribution", id: "feedback_1", approve: true });
  state.contributions[0].status = "approved";
  const client = clients[0]; await act(async () => { client.setQueryData([...BOT_ADMIN_KEY, "state"], structuredClone(state)); });
  await user.click(screen.getByRole("combobox", { name: "Feedback filter" })); await user.click(screen.getByRole("option", { name: "Approved" }));
  await user.click(screen.getByRole("button", { name: "Revoke confirmation" }));
  await user.type(within(screen.getByRole("dialog")).getByRole("textbox"), "The claimed fix was never submitted."); await dialogSubmit(user, "Revoke confirmation");
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "revoke-contribution", id: "feedback_1", text: "The claimed fix was never submitted." });
});

it("handles break requests and guards welcomes, profile resets and ineligible removals", async () => {
  mount("bot-members"); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Approve break" }));
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "away", id: "member_1", approve: true });
  await user.click(screen.getByRole("button", { name: "Queue welcome" })); expect(api.botAdminAction).toHaveBeenCalledTimes(1);
  await dialogSubmit(user, "Queue welcome"); expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "welcome", id: "member_1", confirmed: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await user.click(screen.getByRole("button", { name: "Reset profile link" })); await dialogSubmit(user, "Reset profile link");
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "unlink-profile", id: "member_1", confirmed: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await user.click(screen.getByRole("tab", { name: "Member reviews (1)" }));
  expect((screen.getByRole("button", { name: "Review removal" }) as HTMLButtonElement).disabled).toBe(true); expect(screen.getByText(/Resolve the break request first/)).toBeTruthy();
});

it("reviews join requests and confirms changes to future group joining", async () => {
  mount("joins"); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Approve join" }));
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "join", id: "15550000002@s.whatsapp.net", approve: true });
  await user.click(screen.getByRole("button", { name: "Require join approval" })); await dialogSubmit(user, "Require join approval");
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "join-approvals", enabled: true, confirmed: true });
});

it("keeps group control explicit and preserves failed community update text", async () => {
  mount("group"); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open discussion" })); expect(api.botAdminAction).not.toHaveBeenCalled(); await dialogSubmit(user, "Open discussion");
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "group-mode", open: true, hours: 2, confirmed: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  vi.mocked(api.botAdminAction).mockRejectedValueOnce(new Error("Bot unavailable"));
  await user.type(screen.getByRole("textbox", { name: "Update title" }), "Community help"); await user.type(screen.getByRole("textbox", { name: "Update" }), "Try the new project and share what you learned."); await user.click(screen.getByRole("button", { name: "Publish update" }));
  await screen.findByText("Bot unavailable"); expect((screen.getByRole("textbox", { name: "Update title" }) as HTMLInputElement).value).toBe("Community help");
});

it("requires verified outcomes before resolving messages and repository pins", async () => {
  state.community!.repositories[0].pinStatus = "uncertain";
  mount("deliveries"); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Confirm sent" })); expect(api.botAdminAction).not.toHaveBeenCalled(); await dialogSubmit(user, "Confirm sent");
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "delivery", id: "delivery_1", delivered: true, confirmed: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await user.click(screen.getByRole("button", { name: "Confirm pin failed" })); await dialogSubmit(user, "Confirm pin failed");
  expect(api.botAdminAction).toHaveBeenLastCalledWith({ action: "repository-pin", id: "repo_1", pinned: false, confirmed: true });
});

it("exposes phone connection and group lookup while guarding unlinking", async () => {
  mount("connection"); const user = userEvent.setup();
  await screen.findByText("Circle bot · +15550000000");
  expect(api.botAdmin).not.toHaveBeenCalledWith("groups", expect.anything());
  await user.click(screen.getByRole("button", { name: "Load WhatsApp groups" })); await screen.findByRole("heading", { name: "WhatsApp groups" });
  await user.click(screen.getByRole("button", { name: "Unlink phone" })); expect(api.botAdminAction).not.toHaveBeenCalled(); await dialogSubmit(user, "Unlink phone");
  expect(api.botAdminAction).toHaveBeenCalledWith({ action: "phone-unlink", confirmed: true });
});

it("clears all private bot records on sign-out and refuses late mutation data", async () => {
  let finish: (value: typeof state) => void = () => {};
  vi.mocked(api.botAdminAction).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const client = mount("projects"); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Approve project" }));
  await user.click(screen.getByRole("button", { name: "Sign out" })); await screen.findByRole("link", { name: "Continue with GitHub" });
  await act(async () => { finish(state); });
  expect(client.getQueryData([...BOT_ADMIN_KEY, "state"])).toBeUndefined(); expect(screen.queryByText("Community search · Alice")).toBeNull();
});

it("keeps website administration usable when the bot is down and distinguishes unavailable queues from zero", async () => {
  vi.mocked(api.botAdmin).mockRejectedValue(new ApiError(503, "bot_admin_unavailable", "WhatsApp management is unavailable."));
  mount(); const user = userEvent.setup(); await screen.findByText("WhatsApp queues couldn't be loaded.");
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("tab", { name: "Members" })); expect(screen.getByRole("searchbox", { name: "Search members" })).toBeTruthy();
});

it("restores keyboard focus to a surviving trigger after cancelling a confirmation", async () => {
  mount("repositories"); const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: "Return submission" });
  await user.click(trigger); await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(document.activeElement).toBe(trigger)); expect(api.botAdminAction).not.toHaveBeenCalled();
});

it("blocks a duplicate action after an unknown outcome across sections until an explicit successful refresh", async () => {
  vi.mocked(api.botAdminAction).mockRejectedValueOnce(new ApiError(503, "bot_admin_uncertain", "The change may have completed."));
  mount("group"); const user = userEvent.setup();
  await user.type(await screen.findByRole("textbox", { name: "Update title" }), "Community help"); await user.type(screen.getByRole("textbox", { name: "Update" }), "Try the new project and share what you learned.");
  await user.click(screen.getByRole("button", { name: "Publish update" })); await screen.findByText(/The last result is uncertain/);
  expect((screen.getByRole("button", { name: "Publish update" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("tab", { name: "Projects (1)" }));
  expect((screen.getByRole("button", { name: "Approve project" }) as HTMLButtonElement).disabled).toBe(true); expect(api.botAdminAction).toHaveBeenCalledTimes(1);
  vi.mocked(api.botAdmin).mockRejectedValueOnce(new ApiError(503, "bot_admin_unavailable", "Still offline"));
  await user.click(screen.getByRole("button", { name: "Refresh WhatsApp data" })); await screen.findByText("Still offline");
  expect((screen.getByRole("button", { name: "Approve project" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Refresh WhatsApp data" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Approve project" }) as HTMLButtonElement).disabled).toBe(false));
});
