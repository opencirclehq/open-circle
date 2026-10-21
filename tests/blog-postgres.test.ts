import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../scripts/migrations";
import { commandBlog, readBlog } from "../server/blog";
import { PostgresBlogStore } from "../server/blog-store";
import { admin, alice, blogContract, bob, command, content, publish, submit } from "./helpers/blog-contract";

vi.mock("../server/portfolio-store", async (original) => { const memory = new (await original<typeof import("../server/portfolio-store")>()).MemoryPortfolioStore(null); return { ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => memory }; });

const url = process.env.BLOG_TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL blog contract", () => {
  let pool: Pool;
  let store: PostgresBlogStore;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.startsWith("/opencircle_blog_test_")) throw new Error("Use a disposable local blog test database.");
    pool = new Pool({ connectionString: url, max: 4 });
    const client = await pool.connect();
    try { await runMigrations(client); expect(await runMigrations(client)).toEqual([]); }
    finally { client.release(); }
    store = new PostgresBlogStore(pool);
  });
  beforeEach(async () => { await pool.query("TRUNCATE opencircle_blog_posts"); });
  afterAll(async () => { await pool?.end(); });
  blogContract(() => store);

  it("keeps derived columns in step with the document and enforces unique addresses", async () => {
    const post = await publish(store);
    const { rows } = await pool.query("SELECT slug, author_id, review, visible, featured, published_at FROM opencircle_blog_posts WHERE id = $1", [post.id]);
    expect(rows[0]).toMatchObject({ slug: post.slug, author_id: "2", review: "approved", visible: true, featured: false, published_at: String(post.publishedAt) });
    const other = await submit(store, bob);
    await expect(store.transact(other.id, true, (box) => { box.post!.slug = post.slug; })).rejects.toMatchObject({ status: 409, code: "blog_slug_conflict" });
    await expect(pool.query("UPDATE opencircle_blog_posts SET slug = 'Bad Slug' WHERE id = $1", [other.id])).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls back failed writes and reads the same post through a new connection", async () => {
    const post = await publish(store);
    await expect(store.transact(post.id, true, (box) => { box.post!.hidden = true; throw new Error("Abort save"); })).rejects.toThrow("Abort save");
    expect((await readBlog(new PostgresBlogStore(pool), post.slug!)).title).toBe("Shipping my first pull request");
  });

  it("serialises concurrent changes to one post so exactly one wins each version", async () => {
    const pending = await submit(store);
    const outcomes = await Promise.allSettled([
      commandBlog(store, admin, command({ action: "review", id: pending.id, version: pending.version, decision: "approve" })),
      commandBlog(store, admin, command({ action: "review", id: pending.id, version: pending.version, decision: "changes", reason: "Please add a code example." })),
      commandBlog(store, alice, command({ action: "save", id: pending.id, version: pending.version, content: content({ title: "A competing edit" }) })),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => (outcome as PromiseRejectedResult).reason.code)).toEqual(["blog_conflict", "blog_conflict"]);
  });

  it("creates a post once when the same new post is sent twice at the same moment", async () => {
    const id = randomUUID();
    const input = command({ action: "submit", id, version: 0, content: content() });
    const results = await Promise.allSettled([commandBlog(store, alice, input), commandBlog(store, alice, input)]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await pool.query("SELECT count(*)::int AS n FROM opencircle_blog_posts")).rows[0].n).toBe(1);
  });

  it("saves and approves without borrowing a second transaction connection", async () => {
    const single = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 250 });
    try {
      const isolated = new PostgresBlogStore(single);
      const first = await publish(isolated);
      const second = await publish(isolated, bob);
      expect(second.slug).toBe(`${first.slug}-2`);
      expect((await readBlog(isolated, first.slug!)).title).toBe(content().title);
    } finally { await single.end(); }
  });
});
