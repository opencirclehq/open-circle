import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "../src/components/board/how-it-works";
import { RankTable } from "../src/components/board/rank-table";
import { LeaderboardPodium } from "../src/components/board/leaderboard-podium";
import { publicMember } from "./helpers/fixtures";

it("explains confirmed help, community star credit, limits and delayed scores in a scrollable dialog", () => {
  render(<HowItWorks open onOpenChange={() => {}} helpersDelayed />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("overflow-y-auto");
  expect(screen.getByText("Confirmed useful help")).toBeTruthy();
  expect(screen.getAllByText("20 pts")).toHaveLength(2);
  expect(screen.getByText("+5 pts")).toBeTruthy();
  expect(screen.getByText(/Your confirmed help doesn't expire/)).toBeTruthy();
  expect(screen.getByText("Star another member's repo")).toBeTruthy();
  expect(screen.getByText("Published discussion or question")).toBeTruthy();
  expect(screen.getByText("Comment or reply")).toBeTruthy();
  expect(screen.getByText("Like or poll vote")).toBeTruthy();
  expect(screen.getByText(/here or on GitHub/)).toBeTruthy();
  expect(screen.getByText(/Stars count once per member/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Your last confirmed points stay visible");
});

it("includes star help in desktop and mobile rows and the podium without claiming confirmed credit", () => {
  const member = publicMember({ rank: 4, helpfulContributions: 1, helpedMembers: 1, starHelps: 2, helperPoints: 65, communityPoints: 12 });
  render(<RankTable members={[member]} />);
  expect(screen.getByText("3 helps")).toBeTruthy();
  expect(screen.getByText("2 stars given")).toBeTruthy();
  expect(screen.getByText("3 helps · 2 stars given")).toBeTruthy();
  expect(screen.getAllByTitle("1 confirmed helps for 1 members · 2 members supported by stars · all time")).toHaveLength(2);
  render(<LeaderboardPodium entries={[{ id: "octocat", name: "Octo", points: 85, handle: "Octocat", stars: 10, helpfulContributions: 1, starHelps: 2, helpedMembers: 1, href: "https://github.com/Octocat", seed: "octocat" }]} />);
  expect(screen.getAllByText("3 helps · 2 stars given")).toHaveLength(2);
  expect(screen.queryByText("3 confirmed helps")).toBeNull();
  expect(screen.getByText("12 activity pts")).toBeTruthy();
});
