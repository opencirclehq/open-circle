import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityHeatmap } from "../src/components/board/activity-heatmap";
import { ProgressionPanel } from "../src/components/board/progression-panel";
import { RankTable } from "../src/components/board/rank-table";
import type { MemberProgression } from "../shared/progression";
import { publicMember } from "./helpers/fixtures";

const progression: MemberProgression = {
  login: "Octocat",
  nickname: "Octo",
  currentStreak: 4,
  longestStreak: 9,
  achievements: { first_contribution: Date.parse("2026-10-10T00:00:00Z") },
  activityDays: ["2026-10-13", "2026-10-14"],
  counts: { first_contribution: 7 },
  total: 42,
  goals: [{ id: "streak_30", group: "streak", label: "Thirty-day streak", current: 9, target: 30 }],
};

function renderRankTable(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("Progression marks on the leaderboard", () => {
  it("shows the current streak, its breakdown and earned milestone labels for a ranked member", () => {
    renderRankTable(<RankTable
      members={[publicMember({ currentStreak: 5, longestStreak: 9, achievements: ["first_contribution", "streak_7", "streak_30"] })]}
      total={1}
    />);

    expect(screen.getByTitle("Current streak 5 days · longest 9 · next milestone 30")).toBeTruthy();
    expect(screen.getByText(/day activity streak/)).toBeTruthy();
    expect(screen.getByText("First verified contribution")).toBeTruthy();
    expect(screen.getByText("Thirty-day streak")).toBeTruthy();
  });

  it("names how rare each earned badge is when counts are known", () => {
    renderRankTable(<RankTable
      members={[publicMember({ currentStreak: 5, longestStreak: 5, achievements: ["first_contribution"] })]}
      total={1}
      achievementCounts={{ first_contribution: 7 }}
      memberCount={42}
    />);

    expect(screen.getByText("First verified contribution · earned by 7 of 42 members")).toBeTruthy();
  });

  it("adds no progression marks for a member without verified activity", () => {
    renderRankTable(<RankTable members={[publicMember({ currentStreak: 0, achievements: [] })]} total={1} />);

    expect(screen.queryByText(/day activity streak/)).toBeNull();
    expect(screen.queryByText("First verified contribution")).toBeNull();
    expect(screen.queryByRole("button", { name: /achievements/ })).toBeNull();
  });
});

describe("Progression detail", () => {
  it("draws an activity heatmap labelled by its active days", () => {
    render(<ActivityHeatmap days={["2026-10-13", "2026-10-14"]} weeks={2} today="2026-10-14" />);

    expect(screen.getByRole("img", { name: "2 active days in the last 14 days" })).toBeTruthy();
  });

  it("lists earned badges with dates, rarity and next-goal progress", () => {
    render(<ProgressionPanel progression={progression} />);

    expect(screen.getByText("First verified contribution")).toBeTruthy();
    expect(screen.getByText(/\d+ of 42 members/)).toBeTruthy();
    expect(screen.getByText("Thirty-day streak")).toBeTruthy();
    expect(screen.getByText("9/30")).toBeTruthy();
  });

  it("opens a member's achievements from the leaderboard and loads them on demand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(progression), { status: 200, headers: { "content-type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RankTable members={[publicMember({ currentStreak: 5, achievements: ["first_contribution"] })]} total={1} /></QueryClientProvider>);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "View Octo's achievements" }));

    expect(await screen.findByText("Thirty-day streak")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/progression?login=Octocat"), expect.anything());
    vi.unstubAllGlobals();
  });
});
