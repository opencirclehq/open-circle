import { render, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { GitPullRequestIcon } from "@solar-icons/react/linear";
import { LeaderboardPodium, type LeaderboardEntry } from "../src/components/board/leaderboard-podium";

const entries: LeaderboardEntry[] = ["Avery", "Sam", "Zoe"].map((name, index) => ({
  id: name.toLowerCase(),
  name,
  handle: name,
  points: 660 - index * 100,
  stars: 48 + index,
  href: `https://github.com/${name}`,
  seed: name,
}));

it("keeps progression, activity points and medal artwork together", () => {
  render(<LeaderboardPodium entries={[{ ...entries[0], currentStreak: 7, communityPoints: 42 }]} />);

  expect(screen.getByTitle("7-day activity streak")).toBeTruthy();
  expect(screen.getByText("42 activity pts")).toBeTruthy();
  expect(screen.getByRole("list").querySelector('img[src="/images/podium/star-gold.png"]')).toBeTruthy();
});

it("keeps medals tied to rank as members move and identifies the current user separately", async () => {
  const { rerender } = render(<LeaderboardPodium entries={entries} currentUserId="sam" />);
  const slots = screen.getAllByRole("listitem");
  expect(slots.map((slot) => slot.querySelector("[data-medal]")?.getAttribute("data-medal"))).toEqual(["silver", "gold", "bronze"]);
  expect(within(slots[0]).getByRole("link", { name: /Sam, rank 2, 560 points.*Your profile/ }).getAttribute("href")).toBe("https://github.com/Sam");
  expect(slots[0].querySelector("[data-current-user=true]")).toBeTruthy();
  expect(slots[1].querySelector("[data-current-user=true]")).toBeNull();
  rerender(<LeaderboardPodium entries={[entries[1], entries[0], entries[2]]} currentUserId="sam" />);
  expect(within(slots[1]).getByRole("link", { name: /Sam, rank 1, 560 points.*Your profile/ })).toBeTruthy();
  await waitFor(() => expect(slots[0].querySelector("[data-current-user=true]")).toBeNull());
  expect(slots[1].querySelector("[data-current-user=true]")).toBeTruthy();
});

it("returns vacated and empty slots to neutral finishes without inventing counts or profiles", async () => {
  const { rerender } = render(<LeaderboardPodium entries={entries} />);
  rerender(<LeaderboardPodium entries={[entries[0]]} />);
  const slots = screen.getAllByRole("listitem");
  expect(slots.map((slot) => slot.querySelector("[data-medal]")?.getAttribute("data-medal"))).toEqual(["empty", "gold", "empty"]);
  for (const index of [0, 2]) {
    await waitFor(() => expect(within(slots[index]).queryByRole("link")).toBeNull());
    expect(slots[index].querySelector(".podium-avatar")).toBeNull();
    expect(slots[index].textContent).toContain(`#${index === 0 ? 2 : 3} open`);
  }
  rerender(<LeaderboardPodium entries={[]} />);
  expect(screen.getAllByRole("listitem").every((slot) => slot.querySelector("[data-medal=empty]"))).toBe(true);
  await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
});

it("preserves repository links, full star counts and a real zero forks indicator", () => {
  render(<LeaderboardPodium entries={[{
    ...entries[0], name: "open-kit", points: 1200, stars: 1200,
    href: "https://github.com/Avery/open-kit",
    secondary: { icon: <GitPullRequestIcon size={11} aria-hidden data-testid="fork-icon" />, value: 0, label: "forks" },
  }]} unit="stars" ariaLabel="Top three spotlight repos" />);
  const podium = screen.getByRole("list", { name: "Top three spotlight repos" });
  const link = within(podium).getByRole("link", { name: "open-kit, rank 1, 1,200 stars. Open on GitHub" });
  expect(link.getAttribute("href")).toBe("https://github.com/Avery/open-kit");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(within(podium).getByTestId("fork-icon").parentElement?.textContent).toBe("0 forks");
  expect(podium.querySelector(".podium-slot[data-medal=gold]")).toBeTruthy();
});
