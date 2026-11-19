import { afterEach, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("node:fs/promises", async (load) => {
  const actual = await load<typeof import("node:fs/promises")>();
  return {
    ...actual,
    // Only screenshot reads are faked; fonts and everything else come from disk.
    readFile: (async (file: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) => {
      if (!String(file).includes("og/components")) return (actual.readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
      const bytes = [...files].find(([name]) => String(file).endsWith(name))?.[1];
      if (!bytes) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return bytes;
    }) as typeof actual.readFile,
  };
});
vi.mock("../shared/component-og", () => ({ COMPONENT_SCREENSHOTS: { "draw-a-line": "a1b2c3d4e5f6" } }));
vi.mock("../server/db", () => ({ getStore: () => ({ rateLimit: async () => true }) }));

const { GET } = await import("../api/component-image");
const { COMPONENT_META } = await import("../shared/component-meta");
const { componentImageVersion } = await import("../shared/component-seo");

afterEach(() => files.clear());

const request = (slug: string) => new Request(`https://opencircle.test/api/component-image?slug=${slug}`, { headers: { "x-vercel-forwarded-for": "203.0.113.4" } });

it("serves the captured picture of a component when there is one", async () => {
  const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  files.set("og/components/draw-a-line.png", picture);
  const response = await GET(request("draw-a-line"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(picture);
});

it("falls back to the text card when no picture was captured", async () => {
  const response = await GET(request("split-footer"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
});

it("changes the share link when a new picture is captured", () => {
  const footer = COMPONENT_META.find((component) => component.slug === "split-footer")!;
  const train = COMPONENT_META.find((component) => component.slug === "draw-a-line")!;
  expect(componentImageVersion(train)).not.toBe(componentImageVersion({ ...train, slug: undefined }));
  expect(componentImageVersion(footer)).toBe(componentImageVersion({ ...footer, slug: undefined }));
});
