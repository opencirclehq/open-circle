import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { BLOG_PAGE_SIZE, type BlogPost, type BlogQueue } from "../shared/blog.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";

export interface BlogListing { posts: BlogPost[]; total: number }
export interface BlogTransaction {
  post: BlogPost | null;
  listAuthor(authorId: number): Promise<BlogPost[]>;
  slugTaken(slug: string, id: string): Promise<boolean>;
}
export interface BlogStore {
  listPublished(page: number, topic: string): Promise<BlogListing>;
  readPublished(slug: string): Promise<BlogPost | null>;
  /** Sitemap entries: visible posts whose canonical address is here, not elsewhere. */
  publishedPaths(): Promise<{ slug: string; modifiedAt: number }[]>;
  listAuthor(authorId: number): Promise<BlogPost[]>;
  listAuthorPublished(authorId: number, limit: number): Promise<BlogPost[]>;
  listQueue(queue: BlogQueue, page: number): Promise<BlogListing>;
  slugTaken(slug: string, id: string): Promise<boolean>;
  /** Serialises writes per post; set `box.post` to change it. */
  transact<T>(id: string, write: boolean, run: (box: BlogTransaction) => Promise<T> | T, authorId?: number): Promise<T>;
}

export const visible = (post: BlogPost) => !!post.published && !!post.slug && !post.hidden;
const inQueue = (post: BlogPost, queue: BlogQueue) =>
  queue === "pending" ? post.review === "pending"
    : queue === "published" ? visible(post)
      : queue === "hidden" ? post.hidden
        : queue === "drafts" ? post.review === "draft" || post.review === "changes"
          : queue === "rejected" ? post.review === "rejected"
            : true;
const byPublication = (a: BlogPost, b: BlogPost) => Number(b.featured) - Number(a.featured) || b.publishedAt! - a.publishedAt! || a.id.localeCompare(b.id);
const byQueue = (queue: BlogQueue) => (a: BlogPost, b: BlogPost) => queue === "pending" ? (a.submittedAt ?? 0) - (b.submittedAt ?? 0) || a.id.localeCompare(b.id) : b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
const page = <T,>(rows: T[], number: number) => rows.slice((number - 1) * BLOG_PAGE_SIZE, number * BLOG_PAGE_SIZE);
const slugConflict = () => new HttpError(409, "blog_slug_conflict", "Another post took that address. Try approving again.");

/** Development store in `.data/blog.json`; one process only. */
export class LocalBlogStore implements BlogStore {
  private records: Record<string, BlogPost>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string | null = path.resolve(".data/blog.json")) {
    this.records = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  // Reads see the last committed state without queueing, so a transaction can call them.
  async listPublished(number: number, topic: string) {
    const rows = Object.values(this.records).filter((post) => visible(post) && (!topic || post.published!.topic === topic)).sort(byPublication);
    return { posts: structuredClone(page(rows, number)), total: rows.length };
  }
  async readPublished(slug: string) {
    const post = Object.values(this.records).find((post) => post.slug === slug && visible(post));
    return post ? structuredClone(post) : null;
  }
  async publishedPaths() {
    return Object.values(this.records).filter((post) => visible(post) && !post.published!.canonicalUrl).sort(byPublication).map((post) => ({ slug: post.slug!, modifiedAt: post.editedAt ?? post.publishedAt! }));
  }
  async listAuthor(authorId: number) {
    return structuredClone(Object.values(this.records).filter((post) => post.author.id === authorId).sort((a, b) => b.updatedAt - a.updatedAt));
  }
  async listAuthorPublished(authorId: number, limit: number) {
    return structuredClone(Object.values(this.records).filter((post) => post.author.id === authorId && visible(post)).sort((a, b) => b.publishedAt! - a.publishedAt! || a.id.localeCompare(b.id)).slice(0, limit));
  }
  async listQueue(queue: BlogQueue, number: number) {
    const rows = Object.values(this.records).filter((post) => inQueue(post, queue)).sort(byQueue(queue));
    return { posts: structuredClone(page(rows, number)), total: rows.length };
  }
  async slugTaken(slug: string, id: string) {
    return Object.values(this.records).some((post) => post.slug === slug && post.id !== id);
  }
  async transact<T>(id: string, write: boolean, run: (box: BlogTransaction) => Promise<T> | T): Promise<T> {
    const result = this.tail.then(async () => {
      const box = { post: structuredClone(this.records[id] ?? null), listAuthor: this.listAuthor.bind(this), slugTaken: this.slugTaken.bind(this) };
      const value = await run(box);
      if (write && box.post) {
        if (box.post.slug && await this.slugTaken(box.post.slug, id)) throw slugConflict();
        const next = { ...this.records, [id]: box.post };
        if (this.file) {
          mkdirSync(path.dirname(this.file), { recursive: true });
          const temporary = `${this.file}.${randomUUID()}.tmp`;
          try { writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 }); renameSync(temporary, this.file); }
          finally { rmSync(temporary, { force: true }); }
        }
        this.records = next;
      }
      return structuredClone(value);
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function storageError(error: unknown): never {
  const code = (error as { code?: string }).code ?? "";
  if (["42P01", "42703"].includes(code)) throw new HttpError(503, "blog_migration", "Blog storage needs its database migration. Please try again shortly.");
  if (code === "23505" && (error as { constraint?: string }).constraint === "opencircle_blog_posts_slug_key") throw slugConflict();
  throw error;
}

const QUEUE_SQL: Record<BlogQueue, string> = {
  pending: "review = 'pending'",
  published: "visible",
  hidden: "(document->>'hidden')::boolean",
  drafts: "review IN ('draft', 'changes')",
  rejected: "review = 'rejected'",
  all: "true",
};

export class PostgresBlogStore implements BlogStore {
  constructor(private readonly pool: Pool) {}
  private async rows(sql: string, values: unknown[]): Promise<BlogPost[]> {
    try { return (await this.pool.query<{ document: BlogPost }>(sql, values)).rows.map((row) => row.document); }
    catch (error) { storageError(error); }
  }
  private async listing(where: string, order: string, values: unknown[], number: number): Promise<BlogListing> {
    return this.read(async (client) => {
      const count = await client.query<{ total: number }>(`SELECT count(*)::int AS total FROM opencircle_blog_posts WHERE ${where}`, values);
      const rows = await client.query<{ document: BlogPost }>(`SELECT document FROM opencircle_blog_posts WHERE ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, BLOG_PAGE_SIZE, (number - 1) * BLOG_PAGE_SIZE]);
      return { posts: rows.rows.map((row) => row.document), total: count.rows[0].total };
    });
  }
  private async read<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect().catch(storageError);
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); storageError(error); }
    finally { client.release(); }
  }
  listPublished(number: number, topic: string) {
    return topic
      ? this.listing("visible AND document->'published'->>'topic' = $1", "featured DESC, published_at DESC, id", [topic], number)
      : this.listing("visible", "featured DESC, published_at DESC, id", [], number);
  }
  async readPublished(slug: string) {
    return (await this.rows("SELECT document FROM opencircle_blog_posts WHERE slug = $1 AND visible", [slug]))[0] ?? null;
  }
  async publishedPaths() {
    try {
      const { rows } = await this.pool.query<{ slug: string; modified: string }>("SELECT slug, COALESCE((document->>'editedAt')::bigint, published_at) AS modified FROM opencircle_blog_posts WHERE visible AND document->'published'->>'canonicalUrl' IS NULL ORDER BY featured DESC, published_at DESC, id LIMIT 5000");
      return rows.map((row) => ({ slug: row.slug, modifiedAt: Number(row.modified) }));
    } catch (error) { storageError(error); }
  }
  listAuthor(authorId: number) {
    return this.rows("SELECT document FROM opencircle_blog_posts WHERE author_id = $1 ORDER BY updated_at DESC, id LIMIT 100", [authorId]);
  }
  listAuthorPublished(authorId: number, limit: number) {
    return this.rows("SELECT document FROM opencircle_blog_posts WHERE author_id = $1 AND visible ORDER BY published_at DESC, id LIMIT $2", [authorId, limit]);
  }
  listQueue(queue: BlogQueue, number: number) {
    return this.listing(QUEUE_SQL[queue], queue === "pending" ? "submitted_at, id" : "updated_at DESC, id", [], number);
  }
  async slugTaken(slug: string, id: string) {
    try { return (await this.pool.query("SELECT 1 FROM opencircle_blog_posts WHERE slug = $1 AND id <> $2", [slug, id])).rowCount !== 0; }
    catch (error) { storageError(error); }
  }
  async transact<T>(id: string, write: boolean, run: (box: BlogTransaction) => Promise<T> | T, authorId?: number): Promise<T> {
    const client = await this.pool.connect().catch(storageError);
    try {
      await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL lock_timeout = '5s'");
      if (write && authorId !== undefined) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 41198))", [String(authorId)]);
      if (write) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 41197))", [id]);
      const { rows } = await client.query<{ document: BlogPost }>(`SELECT document FROM opencircle_blog_posts WHERE id = $1${write ? " FOR UPDATE" : ""}`, [id]);
      const box: BlogTransaction = {
        post: rows[0]?.document ?? null,
        listAuthor: async (owner) => (await client.query<{ document: BlogPost }>("SELECT document FROM opencircle_blog_posts WHERE author_id = $1 ORDER BY updated_at DESC, id", [owner])).rows.map((row) => row.document),
        slugTaken: async (slug, postId) => (await client.query("SELECT 1 FROM opencircle_blog_posts WHERE slug = $1 AND id <> $2", [slug, postId])).rowCount !== 0,
      };
      const result = await run(box);
      const post = box.post;
      if (write && post) {
        await client.query(
          `INSERT INTO opencircle_blog_posts (id, slug, author_id, review, visible, featured, published_at, submitted_at, updated_at, document)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, review = EXCLUDED.review, visible = EXCLUDED.visible, featured = EXCLUDED.featured,
             published_at = EXCLUDED.published_at, submitted_at = EXCLUDED.submitted_at, updated_at = EXCLUDED.updated_at, document = EXCLUDED.document
           WHERE opencircle_blog_posts.author_id = EXCLUDED.author_id`,
          [id, post.slug, post.author.id, post.review, visible(post), post.featured, post.publishedAt, post.submittedAt, post.updatedAt, JSON.stringify(post)],
        );
      }
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); storageError(error); }
    finally { client.release(); }
  }
}

let store: BlogStore | undefined;
export function getBlogStore(): BlogStore {
  if (store) return store;
  if (process.env.DATABASE_URL) store = new PostgresBlogStore(createPostgresPool(process.env.DATABASE_URL));
  else if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) throw new HttpError(503, "blog_storage", "The blog needs PostgreSQL storage. Configure DATABASE_URL and apply the blog migration.");
  else store = new LocalBlogStore();
  return store;
}
