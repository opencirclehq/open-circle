import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { applySeo, robotsTxt, seoDocument, sitemapXml } from "../shared/seo";
import { blogSeoDocument } from "../shared/blog-seo";
import { createAppServer } from "../server/node-server";
import { LocalBlogStore } from "../server/blog-store";
import { TestStore } from "./helpers/test-store";
import { content, publish } from "./helpers/blog-contract";

let blog: LocalBlogStore;
const board = new TestStore();
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => null }));
vi.mock("../server/blog-store", async (original) => ({ ...await original<typeof import("../server/blog-store")>(), getBlogStore: () => blog }));
vi.mock("../server/portfolio-store", async (original) => { const memory = new (await original<typeof import("../server/portfolio-store")>()).MemoryPortfolioStore(null); return { ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => memory }; });

let server: Server;
let base: string;
let directory: string;
beforeEach(async () => {
  blog = new LocalBlogStore(null);
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-blog-seo-"));
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

it("serves each post with its own title, share card and readable article for crawlers", async () => {
  const post = await publish(blog, undefined, content({ body: `${content().body}\n\n<https://youtu.be/dQw4w9WgXcQ>\n\nA comparison: a < b & "escaped".` }));
  const response = await fetch(`${base}/blog/${post.slug}`);
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("x-robots-tag")).toBeNull();
  expect(html).toContain("<title>Shipping my first pull request · OpenCircle</title>");
  expect(html).toContain(`<link rel="canonical" href="${DEFAULT_SITE_URL}/blog/${post.slug}" />`);
  expect(html).toContain(`content="${DEFAULT_SITE_URL}/api/blog-image?slug=${post.slug}&amp;v=`);
  const article = /<article id="seo-article">([\s\S]*?)<\/article>/.exec(html)?.[1] ?? "";
  expect(article).toContain("<h2>Picking an issue</h2>");
  expect(article).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
  expect(article).toContain("a &lt; b &amp; &quot;escaped&quot;");
  expect(article).not.toMatch(/<iframe|<script/);
});

it("credits the original address of a cross-posted article and leaves it out of the sitemap", async () => {
  const own = await publish(blog);
  const crossPosted = await publish(blog, undefined, content({ title: "Notes from my first conference talk", canonicalUrl: "https://dev.to/alice/conference-notes" }));
  const html = await (await fetch(`${base}/blog/${crossPosted.slug}`)).text();
  expect(html).toContain('<link rel="canonical" href="https://dev.to/alice/conference-notes" />');
  expect(html).toContain(`<meta property="og:url" content="${DEFAULT_SITE_URL}/blog/${crossPosted.slug}" />`);
  const sitemap = await fetch(`${base}/sitemap.xml`);
  const xml = await sitemap.text();
  expect(sitemap.headers.get("content-type")).toContain("application/xml");
  expect(xml).toContain(`${DEFAULT_SITE_URL}/blog</loc>`);
  expect(xml).toContain(`${DEFAULT_SITE_URL}/blog/${own.slug}</loc>`);
  expect(xml).not.toContain(crossPosted.slug!);
});

it("answers missing posts with a real 404 and keeps writing pages out of search", async () => {
  const missing = await fetch(`${base}/blog/no-such-post`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(await missing.text()).toContain("<title>Post unavailable · OpenCircle</title>");
  for (const page of ["/blog/mine", "/blog/write", "/blog/write/0b6c3a5e-6f7a-4c1e-9d2b-3c4d5e6f7a8b"]) {
    const response = await fetch(`${base}${page}`);
    expect(response.status, page).toBe(200);
    expect(response.headers.get("x-robots-tag"), page).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control"), page).toBe("no-store");
  }
  const index = await fetch(`${base}/blog`);
  expect(index.headers.get("x-robots-tag")).toBeNull();
  expect(await index.text()).toContain("<title>Blog · OpenCircle</title>");
  expect((await fetch(`${base}/api/blog`)).status).toBe(200);
});

it("describes blog pages for search engines, agents and link previews", () => {
  expect(seoDocument("/blog/my-post", DEFAULT_SITE_URL)).toMatchObject({ status: 200, index: true, url: `${DEFAULT_SITE_URL}/blog/my-post` });
  expect(seoDocument("/blog/mine", DEFAULT_SITE_URL)).toMatchObject({ index: false });
  expect(seoDocument("/blog/write/0b6c3a5e-6f7a-4c1e-9d2b-3c4d5e6f7a8b", DEFAULT_SITE_URL)).toMatchObject({ index: false });
  expect(seoDocument("/blog/Not_A_Slug", DEFAULT_SITE_URL).status).toBe(404);
  expect(robotsTxt(DEFAULT_SITE_URL)).toContain("Allow: /api/blog-image");
  expect(sitemapXml(DEFAULT_SITE_URL, "2026-10-21", [{ path: "/blog/a&b", lastmod: "2026-10-20" }])).toContain(`${DEFAULT_SITE_URL}/blog/a&amp;b</loc>`);
  const document = { ...blogSeoDocument({ slug: "first", title: "First <post>", summary: "Summary", publishedAt: 1, editedAt: null, canonicalUrl: "https://dev.to/a/first" }), content: "<p>Body</p>" };
  const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const once = applySeo(shell, document);
  expect(once).toContain('<article id="seo-article"><p>Body</p></article>');
  expect(once).toContain("<title>First &lt;post&gt; · OpenCircle</title>");
  expect(applySeo(once, document)).toBe(once);
  expect(applySeo(once, seoDocument("/tools", DEFAULT_SITE_URL))).not.toContain("seo-article");
});

it("never renders unknown or private posts through the image endpoint", async () => {
  expect((await fetch(`${base}/api/blog-image?slug=../../etc`)).status).toBe(404);
  const pending = await blog.transact("0b6c3a5e-6f7a-4c1e-9d2b-3c4d5e6f7a8b", false, ({ post }) => post);
  expect(pending).toBeNull();
});
