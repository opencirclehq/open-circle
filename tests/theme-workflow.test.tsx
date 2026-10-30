import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import Participation from "@/pages/Participation";
import { api } from "@/lib/api";
import { THEME_KEY } from "@/lib/theme";
import { boardFixture } from "./helpers/fixtures";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  api: { board: vi.fn(), community: vi.fn(), participation: vi.fn() },
}));

let client: QueryClient;

afterEach(() => {
  client?.clear();
  document.documentElement.className = "";
  document.documentElement.style.removeProperty("color-scheme");
});

it("keeps the chosen appearance across pages and switches the participation activity screen", async () => {
  const user = userEvent.setup();
  localStorage.setItem(THEME_KEY, "dark");
  localStorage.setItem("opencircle:account-menu-seen", "1");
  vi.mocked(api.board).mockResolvedValue(boardFixture());
  vi.mocked(api.community).mockResolvedValue({ profile: { id: 1, login: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/1" }, signInAvailable: true, tools: [], counts: {}, voted: [], toolVotes: {} });
  vi.mocked(api.participation).mockResolvedValue({ activity: { linked: true, login: "Alice", enabled: true, tracking: true, contributions: 1, reviewPeers: 1, target: 4, requiredReviewPeers: 2, inactiveDays: 0, graceRemainingDays: 14, awayUntil: null, awayRequestedDays: null, pendingContributions: 0, removalReview: false }, projects: [], help: [], contributions: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(<ThemeProvider><QueryClientProvider client={client}><TooltipProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/" element={<Index />} /><Route path="/participation" element={<Participation />} />
  </Routes></MemoryRouter></TooltipProvider></QueryClientProvider></ThemeProvider>);
  await screen.findByText("Nobody's on the board yet");
  await user.click(screen.getByRole("combobox", { name: "Appearance" }));
  await user.click(screen.getByRole("option", { name: "Light" }));
  expect(document.documentElement.classList.contains("light")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Group participation" }));
  await screen.findByRole("heading", { name: "Your activity" });
  expect(screen.getByRole("combobox", { name: "Appearance" }).textContent).toBe("Light");
  expect(screen.getByRole("progressbar", { name: "Confirmed feedback" }).getAttribute("aria-valuenow")).toBe("1");
  await user.click(screen.getByRole("combobox", { name: "Appearance" }));
  await user.click(screen.getByRole("option", { name: "Dark" }));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  expect(screen.getByRole("progressbar", { name: "Confirmed feedback" }).getAttribute("aria-valuenow")).toBe("1");
});
