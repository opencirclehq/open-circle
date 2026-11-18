import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { COMPONENT_META } from "../shared/component-meta";
import { SEO_PAGES, seoDocument } from "../shared/seo";
import { homeCard, homeCardKey } from "../server/home-image";
import { createAppServer } from "../server/node-server";
import { TestStore } from "./helpers/test-store";

const board = new TestStore();
vi.mock("../server/db", () => ({ getStore: () => board }));
const members = [1, 2, 3, 4].map((rank) => ({ rank, login: `member${rank}`, nickname: `Member ${rank}`, avatarUrl: "https://example.com/avatar.png", score: 100 - rank }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => null }));

let server: Server;
let base: string;
let directory: string;

beforeEach(async () => {
  await board.setBoard({ members } as never);
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-page-image-"));
  writeFileSync(path.join(directory, "index.html"), readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP test port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  rmSync(directory, { recursive: true, force: true });
});

const png = async (response: Response) => Buffer.from(await response.arrayBuffer()).subarray(1, 4).toString();

it("gives every indexed page except home its own card, and private pages none", () => {
  for (const page of SEO_PAGES.filter((entry) => entry.index && entry.path !== "/"))
    expect(seoDocument(page.path).image?.url).toContain(`${DEFAULT_SITE_URL}/api/page-image?path=${encodeURIComponent(page.path)}&v=`);
  for (const page of SEO_PAGES.filter((entry) => !entry.index)) expect(seoDocument(page.path).image).toBeUndefined();
  expect(seoDocument("/").image).toBeUndefined();
  expect(seoDocument("/nowhere").image).toBeUndefined();
});

it("renders page cards and rejects paths that have none", async () => {
  const tools = await fetch(`${base}/api/page-image?path=/tools`);
  expect([tools.status, await png(tools)]).toEqual([200, "PNG"]);
  for (const value of ["/", "/admin", "/nowhere", "../etc"]) expect((await fetch(`${base}/api/page-image?${new URLSearchParams({ path: value })}`)).status).toBe(404);
  expect(await (await fetch(`${base}/tools`)).text()).toContain(`${DEFAULT_SITE_URL}/api/page-image?path=%2Ftools&amp;v=`);
});

it("picks the top three members for the home card", () => {
  const card = homeCard({ members: [members[3], members[1], members[0], members[2]] as never });
  expect(card.seats.map((seat) => seat.rank)).toEqual([1, 2, 3]);
  expect(homeCardKey(card)).not.toBe(homeCardKey(homeCard({ members: [members[0]] as never })));
});

it("renders the home podium even when avatars cannot be loaded", async () => {
  const response = await fetch(`${base}/api/home-image`);
  expect([response.status, await png(response)]).toEqual([200, "PNG"]);
  const home = await (await fetch(`${base}/`)).text();
  expect(home).toContain(`${DEFAULT_SITE_URL}/api/home-image?v=`);
  expect(home).toContain("OpenCircle leaderboard: 1. Member 1, 2. Member 2, 3. Member 3");
  const community = await (await fetch(`${base}/community`)).text();
  expect(community).toContain(`${DEFAULT_SITE_URL}/api/home-image?v=`);
});

it("points every page at a card that renders", async () => {
  const paths = ["/", "/community", "/repositories", "/tools", "/how-it-works", "/blog", "/components", ...COMPONENT_META.map(({ slug }) => `/components/${slug}`)];
  for (const route of paths) {
    const html = await (await fetch(`${base}${route}`)).text();
    const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1].replaceAll("&amp;", "&");
    expect(image, route).toContain("/api/");
    const response = await fetch(`${base}${new URL(image!).pathname}${new URL(image!).search}`);
    expect([route, response.status, await png(response)]).toEqual([route, 200, "PNG"]);
  }
});

it("keeps the static card until a board has been saved", async () => {
  await board.setBoard(null as never);
  expect((await fetch(`${base}/api/home-image`)).status).toBe(503);
  expect(await (await fetch(`${base}/`)).text()).toContain(`${DEFAULT_SITE_URL}/og.png`);
});
