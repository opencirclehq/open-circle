import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as imageApi from "../api/component-image";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { COMPONENT_META, componentSlugFromPath } from "../shared/component-meta";
import { componentImageVersion, componentSeoDocument } from "../shared/component-seo";
import { robotsTxt } from "../shared/seo";
import { shareImage } from "../server/forum-image";
import { createAppServer } from "../server/node-server";
import { TestStore } from "./helpers/test-store";

const board = new TestStore();
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => null }));

let server: Server;
let base: string;
let directory: string;

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-component-seo-"));
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

it("recognises only the library's own component addresses", () => {
  expect(componentSlugFromPath("/components/draw-a-line")).toBe("draw-a-line");
  for (const path of ["/components", "/components/", "/components/missing", "/components/draw-a-line/extra", "/components/../admin"])
    expect(componentSlugFromPath(path)).toBeNull();
});

it("points each component's share card at its own image", () => {
  const component = COMPONENT_META.find((entry) => entry.slug === "draw-a-line")!;
  const document = componentSeoDocument(component);
  expect(document.title).toBe("Draw a Line · Components · OpenCircle");
  expect(document.url).toBe(`${DEFAULT_SITE_URL}/components/draw-a-line`);
  expect(document.image?.url).toBe(`${DEFAULT_SITE_URL}/api/component-image?slug=draw-a-line&v=${componentImageVersion(component)}`);
  expect(componentImageVersion({ ...component, description: "Changed" })).not.toBe(componentImageVersion(component));
});

it.each(COMPONENT_META)("serves $slug with its own title and share card", async ({ slug, name }) => {
  const response = await fetch(`${base}/components/${slug}`);
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain(`<title>${name} · Components · OpenCircle</title>`);
  expect(html).toContain(`<link rel="canonical" href="${DEFAULT_SITE_URL}/components/${slug}" />`);
  expect(html).toContain(`content="${DEFAULT_SITE_URL}/api/component-image?slug=${slug}&amp;v=`);
  expect((await fetch(`${base}/api/component-image?slug=${slug}`)).status).toBe(200);
});

it("keeps the generic card for a component that does not exist", async () => {
  const unknown = await (await fetch(`${base}/components/missing`)).text();
  expect(unknown).not.toContain("/api/component-image");
});

it("renders a PNG card for a component and rejects anything else", async () => {
  const response = await fetch(`${base}/api/component-image?slug=draw-a-line`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
  for (const slug of ["missing", "../../etc", ""]) expect((await fetch(`${base}/api/component-image?${new URLSearchParams({ slug })}`)).status).toBe(404);
  expect((await imageApi.HEAD(new Request(`${base}/api/component-image?slug=icon-folder`, { method: "HEAD" }))).status).toBe(200);
  expect(robotsTxt(DEFAULT_SITE_URL)).toContain("Allow: /api/component-image");
});

it("fits a very long component name on the card", async () => {
  const name = "An Extremely Long Component Name That Keeps Going Past Any Sensible Width For A Share Card";
  const bytes = await shareImage("component:long-name", { label: "Component", title: name, description: "x ".repeat(200), author: "#one #two #three #four #five", category: "Motion" });
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
});
