import { botAdminFixture } from "./helpers/bot-admin";
import type { ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAnalytics as AnalyticsData } from "../shared/analytics";
import type { AdminSession, AdminState } from "../shared/types";
import type { CommunityTool } from "../shared/community";
import Admin from "../src/pages/Admin";
import { AdminAnalytics } from "../src/components/admin-analytics";
import { ToolModeration } from "../src/components/board/tool-moderation";
import { AdminAnalyticsSkeleton, AdminDashboardSkeleton, AdminToolsSkeleton } from "../src/components/admin-skeleton";
import { api } from "../src/lib/api";
import { boardFixture } from "./helpers/fixtures";

vi.mock("../src/lib/api", async (original) => ({
  ...await original<typeof import("../src/lib/api")>(),
  api: {
    botAdmin: vi.fn(), adminSession: vi.fn(), adminState: vi.fn(), adminTools: vi.fn(), adminAnalytics: vi.fn(),
    adminSignOut: vi.fn(), approveTool: vi.fn(), removeTool: vi.fn(),
  },
}));

const clients: QueryClient[] = [];
const profile = { id: 1, login: "organiser", avatarUrl: "" };
const board = boardFixture();
const state: AdminState = { config: { invite: board.invite, weights: board.weights }, members: [] };
const analytics: AnalyticsData = {
  days: 30, generatedAt: Date.now(), startedAt: null,
  current: { visitors: 42, pageViews: 84, returningVisitors: 4, daily: [{ date: "2026-10-15", visitors: 42, pageViews: 84 }], pages: [], sources: [] },
  previous: null,
  growth: { members: 2, previousMembers: 1, toolSubmissions: 0, previousToolSubmissions: 0, pendingTools: 0 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function renderWithQueries(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/admin"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(api.botAdmin).mockReset().mockResolvedValue(botAdminFixture());
  vi.mocked(api.adminSession).mockReset().mockResolvedValue({ configured: true, profile });
  vi.mocked(api.adminState).mockReset().mockResolvedValue(state);
  vi.mocked(api.adminTools).mockReset().mockResolvedValue([]);
  vi.mocked(api.adminAnalytics).mockReset().mockResolvedValue(analytics);
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("Admin loading", () => {
  it("keeps placeholder geometry independent of font text measurements", () => {
    const measureText = vi.spyOn(document, "createRange");
    render(<>
      <AdminDashboardSkeleton label="Loading admin data…" />
      <AdminAnalyticsSkeleton />
      <AdminToolsSkeleton />
    </>);
    expect(measureText).not.toHaveBeenCalled();
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it("shows an accessible Skelo shell without fetching private data during the access check", async () => {
    const session = deferred<AdminSession>();
    vi.mocked(api.adminSession).mockReturnValue(session.promise);
    const { container } = renderWithQueries(<Admin />);
    const loading = screen.getByRole("status", { name: "Checking admin access…" });
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.querySelector(".lr-skeleton")).toBeTruthy();
    expect(loading.querySelector("[data-loading-template][inert]")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(api.adminState).not.toHaveBeenCalled();
    expect(api.adminTools).not.toHaveBeenCalled();
    expect(api.adminAnalytics).not.toHaveBeenCalled();
    await act(async () => session.resolve({ configured: true, profile: null }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(container.querySelector(".lr-skeleton")).toBeNull();
    expect(api.adminState).not.toHaveBeenCalled();
  });

  it("replaces the dashboard shell with usable tabs while analytics is still loading", async () => {
    const dashboard = deferred<AdminState>();
    const report = deferred<AnalyticsData>();
    vi.mocked(api.adminState).mockReturnValue(dashboard.promise);
    vi.mocked(api.adminAnalytics).mockReturnValue(report.promise);
    renderWithQueries(<Admin />);
    await screen.findByRole("status", { name: "Loading admin data…" });
    expect(api.adminAnalytics).not.toHaveBeenCalled();
    await act(async () => dashboard.resolve(state));
    await screen.findByRole("status", { name: "Loading analytics…" });
    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Analytics period" })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByRole("textbox", { name: "WhatsApp invite link" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading analytics…" })).toBeNull();
  });

  it("shows the report after loading and retains its values during a background refresh", async () => {
    const initial = deferred<AnalyticsData>();
    const refresh = deferred<AnalyticsData>();
    vi.mocked(api.adminAnalytics).mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise);
    const { client, container } = renderWithQueries(<AdminAnalytics onUnauthorized={vi.fn()} onReviewTools={vi.fn()} />);
    expect(screen.getByRole("status", { name: "Loading analytics…" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => initial.resolve(analytics));
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    expect(screen.getByText("42", { selector: "dd" })).toBeTruthy();
    expect(container.querySelector(".lr-skeleton")).toBeNull();
    await act(async () => { void client.invalidateQueries({ queryKey: ["admin", "analytics"] }); });
    await waitFor(() => expect(api.adminAnalytics).toHaveBeenCalledTimes(2));
    expect(screen.getByText("42", { selector: "dd" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading analytics…" })).toBeNull();
    await act(async () => refresh.resolve({ ...analytics, current: { ...analytics.current, visitors: 43 } }));
    await screen.findByText("43");
  });

  it("loads a newly selected period and replaces a failed loader with a working retry", async () => {
    const nextPeriod = deferred<AnalyticsData>();
    vi.mocked(api.adminAnalytics).mockResolvedValueOnce(analytics).mockReturnValueOnce(nextPeriod.promise).mockResolvedValueOnce({ ...analytics, days: 7 });
    const user = userEvent.setup();
    renderWithQueries(<AdminAnalytics onUnauthorized={vi.fn()} onReviewTools={vi.fn()} />);
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    await user.click(screen.getByRole("combobox", { name: "Analytics period" }));
    await user.click(await screen.findByRole("option", { name: "Last 7 days" }));
    expect(screen.getByRole("status", { name: "Loading analytics…" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => nextPeriod.reject(new Error("Unavailable")));
    const retry = await screen.findByRole("button", { name: "Retry analytics" });
    expect(screen.queryByRole("status", { name: "Loading analytics…" })).toBeNull();
    await user.click(retry);
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    expect(api.adminAnalytics).toHaveBeenLastCalledWith(7, expect.any(AbortSignal));
  });

  it("loads tool reviews independently and removes the loader for an empty queue", async () => {
    const tools = deferred<CommunityTool[]>();
    vi.mocked(api.adminTools).mockReturnValue(tools.promise);
    renderWithQueries(<Admin />);
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    await userEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.getByRole("status", { name: "Loading tools…" }).querySelector(".lr-skeleton")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Tool status" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    await act(async () => tools.resolve([]));
    await screen.findByText("No tools yet. Add a tool to get started.");
    expect(screen.queryByRole("status", { name: "Loading tools…" })).toBeNull();
  });

  it("replaces a failed tools request with recovery and loads the empty state on retry", async () => {
    const tools = deferred<CommunityTool[]>();
    vi.mocked(api.adminTools).mockReturnValueOnce(tools.promise).mockResolvedValueOnce([]);
    renderWithQueries(<ToolModeration />);
    expect(screen.getByRole("status", { name: "Loading tools…" })).toBeTruthy();
    await act(async () => tools.reject(new Error("Unavailable")));
    await userEvent.click(await within(screen.getByRole("region", { name: "Tools" })).findByRole("button", { name: "Try again" }));
    await screen.findByText("No tools yet. Add a tool to get started.");
    expect(screen.queryByRole("status", { name: "Loading tools…" })).toBeNull();
  });
});
