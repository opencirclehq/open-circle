import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminBotSettings from "../src/components/admin-bot-settings";
import { api, ApiError } from "../src/lib/api";
import { defaultBotMessages, defaultBotOptions, MESSAGE_TEMPLATES, type BotSettingsState } from "../shared/bot-settings";

vi.mock("../src/lib/api", async (original) => ({ ...await original<typeof import("../src/lib/api")>(), api: { botSettings: vi.fn(), saveBotSettings: vi.fn() } }));
let state: BotSettingsState;
const clients: QueryClient[] = [];
beforeEach(() => {
  state = {
    version: 1, policy: { enabled: true, timezone: "Africa/Lagos", welcomeTimes: ["09:00", "14:00", "19:00"], quietStart: 22, quietEnd: 8, graceDays: 14, target: 4, reviewPeers: 2, periodDays: 28, reminderDays: 14, warningDays: 21, removalDays: 28 },
    community: { groupSchedule: false, summariesEnabled: false, mentorMatching: false, sessionsEnabled: false, summaryTime: "19:00", announcementsJid: "", mentorWaitHours: 24, helpDay: 3, helpTime: "18:00", demoDay: 5, demoTime: "18:00", sessionMinutes: 60, repositoriesEnabled: false, pinRepositories: false, weeklyBoardEnabled: false },
    options: defaultBotOptions(), messages: defaultBotMessages(), status: { connected: true, botAdmin: true, groupOpen: false, tracking: true, announced: true, lastCheckAt: Date.now(), pendingWelcomes: 2, uncertainDeliveries: 0, consoleUrl: "https://wa.opencircle.test" },
  };
  vi.mocked(api.botSettings).mockReset().mockResolvedValue(state); vi.mocked(api.saveBotSettings).mockReset();
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client); client.setQueryData(["admin", "session"], { configured: true, profile: { id: 42, login: "organiser" } });
  const unauthorized = vi.fn(); const view = render(<QueryClientProvider client={client}><AdminBotSettings onUnauthorized={unauthorized} /></QueryClientProvider>); return { client, unauthorized, ...view };
}

it("shows detailed controls, saves the tagging choice and retains a failed message draft for retry", async () => {
  const user = userEvent.setup(); setup();
  const tag = await screen.findByRole("switch", { name: "Tag newcomers" }); await user.click(tag);
  await user.click(screen.getByRole("tab", { name: "Messages" }));
  await user.click(screen.getByText("New member greeting", { selector: "summary" }));
  const message = screen.getByRole("textbox", { name: "New member greeting message" }); await user.clear(message); await user.type(message, "Welcome builders!");
  expect(within(message.closest("details")!).getByText("Preview with sample values")).toBeTruthy();
  vi.mocked(api.saveBotSettings).mockRejectedValueOnce(new ApiError(503, "bot_settings_unavailable", "Bot is reconnecting."));
  await user.click(screen.getByRole("button", { name: "Save bot settings" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Your changes are still here")); expect((message as HTMLTextAreaElement).value).toBe("Welcome builders!");
  const input = vi.mocked(api.saveBotSettings).mock.calls[0][0]; expect(input.options.welcomeTagging).toBe(false); expect(input.messages.welcomeGreeting).toBe("Welcome builders!");
  vi.mocked(api.saveBotSettings).mockResolvedValueOnce({ ...state, ...input, version: 2 }); await user.click(screen.getByRole("button", { name: "Save bot settings" }));
  await screen.findByText("Saved · version 2"); expect(screen.queryByRole("button", { name: "Cancel bot changes" })).toBeNull();
});

it("keeps unsaved values when background checks return and lets cancel restore the last save", async () => {
  const user = userEvent.setup(); const { client } = setup();
  const tag = await screen.findByRole("switch", { name: "Tag newcomers" }); await user.click(tag); expect(tag.getAttribute("aria-checked")).toBe("false");
  client.setQueryData(["admin", "bot-settings"], { ...state, status: { ...state.status, pendingWelcomes: 3 } }); await waitFor(() => expect(screen.getByText("3 queued welcomes")).toBeTruthy()); expect(tag.getAttribute("aria-checked")).toBe("false");
  await user.click(screen.getByRole("button", { name: "Cancel bot changes" })); expect(tag.getAttribute("aria-checked")).toBe("true"); expect(api.saveBotSettings).not.toHaveBeenCalled();
});

it("validates placeholders, previews sample values, searches formats and resets only the selected message", async () => {
  const user = userEvent.setup(); setup(); await screen.findByRole("switch", { name: "Tag newcomers" });
  await user.click(screen.getByRole("tab", { name: "Messages" })); await user.click(screen.getByText("New member greeting", { selector: "summary" }));
  const detail = screen.getByText("New member greeting", { selector: "summary" }).parentElement!; const message = within(detail).getByRole("textbox");
  await user.clear(message); await user.type(message, "Hello "); await user.click(within(detail).getByRole("button", { name: "{{count}}" })); expect((message as HTMLTextAreaElement).value).toBe("Hello {{count}}"); expect(within(detail).getByText("Hello 3")).toBeTruthy();
  await user.type(message, " {{password}}", { skipClick: true }); expect(screen.getByRole("button", { name: "Save bot settings" }).hasAttribute("disabled")).toBe(true);
  await user.click(within(detail).getByRole("button", { name: "Reset this message" })); expect((message as HTMLTextAreaElement).value).toBe(MESSAGE_TEMPLATES.welcomeGreeting.body);
  await user.type(screen.getByRole("searchbox", { name: "Search message formats" }), "repository announcement"); expect(screen.getByText("Repository announcement", { selector: "summary" })).toBeTruthy(); expect(screen.queryByText("New member greeting", { selector: "summary" })).toBeNull();
});

it("preserves a conflicting draft and requires loading the newer settings", async () => {
  const user = userEvent.setup(); const { client } = setup(); const tag = await screen.findByRole("switch", { name: "Tag newcomers" }); await user.click(tag);
  client.setQueryData(["admin", "bot-settings"], { ...state, version: 2 }); await screen.findByText(/Another admin saved newer settings/); expect(tag.getAttribute("aria-checked")).toBe("false"); expect(screen.getByRole("button", { name: "Save bot settings" }).hasAttribute("disabled")).toBe(true);
  vi.spyOn(window, "confirm").mockReturnValue(true); await user.click(screen.getByRole("button", { name: "Load latest bot settings" })); expect(tag.getAttribute("aria-checked")).toBe("true"); expect(screen.queryByText(/Another admin saved newer settings/)).toBeNull();
});

it("retries unavailable settings and does not refill private cache after a late save on sign-out", async () => {
  const user = userEvent.setup(); vi.mocked(api.botSettings).mockRejectedValueOnce(new ApiError(503, "bot_settings_unavailable", "Bot access is not configured.")); const { client, unmount } = setup();
  await user.click(await screen.findByRole("button", { name: "Retry bot settings" })); await user.click(await screen.findByRole("switch", { name: "Tag newcomers" }));
  let resolve!: (value: BotSettingsState) => void; vi.mocked(api.saveBotSettings).mockImplementationOnce(() => new Promise((done) => { resolve = done; })); await user.click(screen.getByRole("button", { name: "Save bot settings" }));
  expect(screen.getByRole("switch", { name: "Tag newcomers" }).hasAttribute("disabled")).toBe(true); client.setQueryData(["admin", "session"], { configured: true, profile: null }); unmount(); client.removeQueries({ queryKey: ["admin", "bot-settings"] }); resolve({ ...state, version: 2 }); await new Promise((done) => setTimeout(done, 10)); expect(client.getQueryData(["admin", "bot-settings"])).toBeUndefined();
});

it("hides an unsupported weekly option and saves only the bot's actual settings", async () => {
  delete state.options.weeklyEngagementEnforcement;
  vi.mocked(api.saveBotSettings).mockResolvedValue({ ...state, version: 2, options: { ...state.options, welcomeTagging: false } });
  const user = userEvent.setup(); setup(); await screen.findByRole("switch", { name: "Tag newcomers" });
  await user.click(screen.getByRole("tab", { name: "Moderation" })); expect(screen.queryByRole("switch", { name: "Weekly inactivity warnings and removal" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Welcome" })); await user.click(screen.getByRole("switch", { name: "Tag newcomers" })); await user.click(screen.getByRole("button", { name: "Save bot settings" }));
  expect(vi.mocked(api.saveBotSettings).mock.calls[0][0].options).not.toHaveProperty("weeklyEngagementEnforcement");
});

it("keeps an active message editor visible when its edited text no longer matches the search", async () => {
  const user = userEvent.setup(); setup(); await screen.findByRole("switch", { name: "Tag newcomers" }); await user.click(screen.getByRole("tab", { name: "Messages" }));
  await user.type(screen.getByRole("searchbox", { name: "Search message formats" }), "Welcome to our"); await user.click(screen.getByText("New member greeting", { selector: "summary" }));
  const editor = screen.getByRole("textbox", { name: "New member greeting message" }); await user.clear(editor); await user.type(editor, "Hello builders"); expect(document.activeElement).toBe(editor); expect((editor as HTMLTextAreaElement).value).toBe("Hello builders"); expect(screen.getByText("New member greeting", { selector: "summary" })).toBeTruthy();
});
