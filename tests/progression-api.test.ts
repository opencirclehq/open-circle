import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../api/progression";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

let board: TestStore;
vi.mock("../server/db", () => ({ getStore: () => board }));

beforeEach(() => {
  board = new TestStore();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const req = (login: string) => new Request(`https://opencircle.test/api/progression?login=${encodeURIComponent(login)}`);

it("returns a member's streak, earned badges, activity days and rarity", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));

  await board.createMember(memberRecord({
    activityDays: ["2026-10-12", "2026-10-13", "2026-10-14"],
    longestStreak: 7,
    reviews: 1,
    achievements: { streak_7: 111 },
  }));

  const response = await GET(req("octocat"));

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ login: "Octocat", nickname: "Octo", currentStreak: 3, longestStreak: 7, total: 1 });
  expect(data.achievements).toMatchObject({ streak_7: 111 });
  expect(data.activityDays).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  expect(data.counts.streak_7).toBe(1);
  expect(Array.isArray(data.goals)).toBe(true);
});

it("has no public progression for a hidden or missing member", async () => {
  await board.createMember(memberRecord({ login: "ghost", hidden: true }));

  expect((await GET(req("ghost"))).status).toBe(404);
  expect((await GET(req("nobody"))).status).toBe(404);
});

it("rejects a malformed login before reading storage", async () => {
  expect((await GET(req("not a login"))).status).toBe(400);
});
