import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip";
import Index from "../src/pages/Index";
import { BOARD_KEY } from "../src/hooks/use-board";
import type { Board } from "../shared/types";
import { boardFixture, publicMember } from "./helpers/fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/community") return new Response(JSON.stringify({ tools: [], counts: {}, voted: [] }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`Unexpected request: ${url}`);
  }));
});

function renderBoard(board: Board) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(BOARD_KEY, board);
  return render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="always">
        <TooltipProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Index />
          </MemoryRouter>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>,
  );
}

const members = (streaks: number[]) => streaks.map((currentStreak, i) => publicMember({
  login: `dev${i + 1}`, nickname: `Dev ${i + 1}`, rank: i + 1, currentStreak, longestStreak: currentStreak,
}));

it("sorts the ranking below the podium by streak on request", async () => {
  renderBoard(boardFixture({ members: members([0, 1, 1, 3, 9]) }));
  const user = userEvent.setup();
  const rows = () => within(screen.getByRole("table", { name: "Ranks 4 and below" })).getAllByRole("row").slice(1).map((row) => row.textContent ?? "");

  expect(rows()[0]).toContain("Dev 4");
  expect(rows()[1]).toContain("Dev 5");

  await user.click(screen.getByRole("button", { name: "Streak" }));

  expect(rows()[0]).toContain("Dev 5");
  expect(rows()[1]).toContain("Dev 4");

  await user.click(screen.getByRole("button", { name: "Rank" }));

  expect(rows()[0]).toContain("Dev 4");
});
