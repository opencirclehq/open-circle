import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import type { ForumAggregate, ForumContent, ForumFilter, ForumThread } from "../shared/forum.js";
import { FORUM_PAGE_SIZE } from "../shared/forum.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";
import { forumActivity } from "./forum-activity.js";
import type { CommunityActivity } from "../shared/community-activity.js";

export interface ForumListing { threads: { thread: ForumThread; commentCount: number }[]; total: number }
export type PublishedForumThread = Pick<ForumThread, "id" | "kind" | "author"> & { content: ForumContent };
export interface ForumStore {
  readActivity(): Promise<CommunityActivity[]>;
  readPublished(id: string): Promise<PublishedForumThread | null>;
  list(filter: ForumFilter, viewerId: number, admin: boolean): Promise<ForumListing>;
  transact<T>(id: string, write: boolean, run: (data: ForumAggregate) => Promise<T> | T): Promise<T>;
}
const empty = (): ForumAggregate => ({ thread: null, comments: [], votes: {}, reports: [], audit: [], requests: {} });
function matches(data: ForumAggregate, f: ForumFilter, viewer: number, admin: boolean) {
  const t = data.thread!;
  if (t.kind !== f.kind && !admin && !f.mine) return false;
  if (!admin && (t.hidden || (f.mine ? t.author.id !== viewer : !t.published))) return false;
  if (admin && f.queue === "pending" && t.review !== "pending") return false;
  if (admin && f.queue === "reports" && !data.reports.some((r) => !r.resolved)) return false;
  if (admin && f.queue === "hidden" && !t.hidden) return false;
  if (admin && f.queue === "published" && (!t.published || t.hidden)) return false;
  if (admin && f.queue === "drafts" && t.review !== "draft") return false;
  const content = (admin || f.mine ? t.revision ?? t.published : t.published)!;
  return (!f.search || `${content.title}\n${content.body}`.toLowerCase().includes(f.search.toLowerCase())) && (!f.category || content.category === f.category) && (!f.status || (f.status === "resolved" ? t.resolved : !t.resolved));
}
export class LocalForumStore implements ForumStore {
  private records: Record<string, ForumAggregate>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string | null = path.resolve(".data/forum.json")) {
    this.records = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  async readActivity(): Promise<CommunityActivity[]> {
    await this.tail;
    return structuredClone(Object.values(this.records).flatMap((data) => forumActivity(data)));
  }
  async readPublished(id: string): Promise<PublishedForumThread | null> {
    await this.tail;
    const thread = this.records[id]?.thread;
    return thread?.published && !thread.hidden ? structuredClone({ id: thread.id, kind: thread.kind, author: thread.author, content: thread.published }) : null;
  }
  async list(filter: ForumFilter, viewerId: number, admin: boolean) {
    await this.tail;
    const rows = Object.values(this.records).filter((data) => data.thread && matches(data, filter, viewerId, admin)).sort((a, b) => Number(b.thread!.pinned) - Number(a.thread!.pinned) || b.thread!.createdAt - a.thread!.createdAt || a.thread!.id.localeCompare(b.thread!.id));
    return { threads: structuredClone(rows.slice((filter.page - 1) * FORUM_PAGE_SIZE, filter.page * FORUM_PAGE_SIZE).map((data) => ({ thread: data.thread!, commentCount: data.comments.filter((c) => !c.hidden && !data.comments.some((p) => p.id === c.parentId && p.hidden)).length }))), total: rows.length };
  }
  async transact<T>(id: string, write: boolean, run: (data: ForumAggregate) => Promise<T> | T): Promise<T> {
    const result = this.tail.then(async () => {
      const data = structuredClone(this.records[id] ?? empty());
      const value = await run(data);
      if (write && data.thread) {
        const next = { ...this.records, [id]: data };
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
  if (["42P01", "42703"].includes((error as { code?: string }).code ?? "")) throw new HttpError(503, "forum_migration", "Community storage needs its database migration. Please try again shortly.");
  throw error;
}
async function inTransaction<T>(pool: Pool, write: boolean, run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); storageError(error); }
  finally { client.release(); }
}
export class PostgresForumStore implements ForumStore {
  constructor(private readonly pool: Pool) {}
  async readActivity(): Promise<CommunityActivity[]> {
    try {
      const { rows } = await this.pool.query<{ document: ForumThread; comments: ForumAggregate["comments"]; votes: ForumAggregate["votes"] }>(`SELECT t.document,
        COALESCE((SELECT jsonb_agg(c.document) FROM opencircle_forum_comments c WHERE c.thread_id=t.id), '[]'::jsonb) AS comments,
        COALESCE((SELECT jsonb_object_agg(v.voter_id::text, v.option_id) FROM opencircle_forum_votes v WHERE v.thread_id=t.id), '{}'::jsonb) AS votes
        FROM opencircle_forum_threads t WHERE t.document->'published' <> 'null'::jsonb`);
      return rows.flatMap((row) => forumActivity({ thread: row.document, comments: row.comments, votes: row.votes }));
    } catch (error) { storageError(error); }
  }
  async readPublished(id: string): Promise<PublishedForumThread | null> {
    try {
      const result = await this.pool.query<PublishedForumThread>("SELECT id, document->>'kind' AS kind, document->'author' AS author, document->'published' AS content FROM opencircle_forum_threads WHERE id=$1 AND document->'published' <> 'null'::jsonb AND NOT (document->>'hidden')::boolean", [id]);
      return result.rows[0] ?? null;
    } catch (error) { storageError(error); }
  }
  async list(f: ForumFilter, viewerId: number, admin: boolean): Promise<ForumListing> {
    return inTransaction(this.pool, false, async (client) => {
      const values: unknown[] = [];
      const param = (value: unknown) => { values.push(value); return `$${values.length}`; };
      const where: string[] = [];
      if (!admin) {
        if (!f.mine) where.push(`t.document->>'kind' = ${param(f.kind)}`);
        where.push(f.mine ? `NOT (t.document->>'hidden')::boolean AND (t.document->'author'->>'id')::bigint = ${param(viewerId)}` : "t.document->'published' <> 'null'::jsonb AND NOT (t.document->>'hidden')::boolean");
      } else {
        if (f.queue === "pending") where.push("t.document->>'review' = 'pending'");
        if (f.queue === "reports") where.push("EXISTS (SELECT 1 FROM opencircle_forum_reports r WHERE r.thread_id=t.id AND NOT (r.document->>'resolved')::boolean)");
        if (f.queue === "hidden") where.push("(t.document->>'hidden')::boolean");
        if (f.queue === "published") where.push("t.document->'published' <> 'null'::jsonb AND NOT (t.document->>'hidden')::boolean");
        if (f.queue === "drafts") where.push("t.document->>'review' = 'draft'");
      }
      const content = admin || f.mine ? "COALESCE(NULLIF(t.document->'revision', 'null'::jsonb), t.document->'published')" : "t.document->'published'";
      if (f.search) where.push(`strpos(lower(((${content})->>'title') || E'\\n' || ((${content})->>'body')), lower(${param(f.search)})) > 0`);
      if (f.category) where.push(`(${content})->>'category' = ${param(f.category)}`);
      if (f.status) where.push(`(t.document->>'resolved')::boolean = ${param(f.status === "resolved")}`);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const count = await client.query(`SELECT count(*)::int AS total FROM opencircle_forum_threads t ${clause}`, values);
      const limit = param(FORUM_PAGE_SIZE); const offset = param((f.page - 1) * FORUM_PAGE_SIZE);
      const rows = await client.query(`SELECT t.document, (SELECT count(*)::int FROM opencircle_forum_comments c WHERE c.thread_id=t.id AND NOT (c.document->>'hidden')::boolean AND NOT EXISTS (SELECT 1 FROM opencircle_forum_comments p WHERE p.thread_id=t.id AND p.id=(c.document->>'parentId')::uuid AND (p.document->>'hidden')::boolean)) AS comments FROM opencircle_forum_threads t ${clause} ORDER BY (t.document->>'pinned')::boolean DESC, (t.document->>'createdAt')::bigint DESC, t.id ASC LIMIT ${limit} OFFSET ${offset}`, values);
      return { threads: rows.rows.map((r) => ({ thread: r.document as ForumThread, commentCount: r.comments as number })), total: count.rows[0].total };
    });
  }
  async transact<T>(id: string, write: boolean, run: (data: ForumAggregate) => Promise<T> | T): Promise<T> {
    return inTransaction(this.pool, write, async (client) => {
      if (write) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 26743))", [id]);
      const thread = await client.query(`SELECT document FROM opencircle_forum_threads WHERE id=$1${write ? " FOR UPDATE" : ""}`, [id]);
      const data = empty();
      data.thread = thread.rows[0]?.document ?? null;
      if (data.thread) {
        for (const key of ["comments", "reports", "audit"] as const) {
          const rows = await client.query(`SELECT document FROM opencircle_forum_${key} WHERE thread_id=$1 ORDER BY created_at, id`, [id]);
          Object.assign(data, { [key]: rows.rows.map((r) => r.document) });
        }
        const votes = await client.query("SELECT voter_id, option_id FROM opencircle_forum_votes WHERE thread_id=$1", [id]);
        data.votes = Object.fromEntries(votes.rows.map((r) => [r.voter_id, r.option_id]));
        const requests = await client.query("SELECT request_key, fingerprint FROM opencircle_forum_requests WHERE thread_id=$1", [id]);
        data.requests = Object.fromEntries(requests.rows.map((r) => [r.request_key, r.fingerprint]));
      }
      const before = structuredClone(data);
      const result = await run(data);
      if (write && data.thread) {
        await client.query("INSERT INTO opencircle_forum_threads (id, document) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET document=EXCLUDED.document", [id, JSON.stringify(data.thread)]);
        for (const key of ["comments", "reports", "audit"] as const) {
          const previous = new Map(before[key].map((r) => [r.id, JSON.stringify(r)]));
          for (const row of data[key]) if (previous.get(row.id) !== JSON.stringify(row)) {
            const at = "at" in row ? row.at : row.createdAt;
            await client.query(`INSERT INTO opencircle_forum_${key} (id,thread_id,document,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET document=EXCLUDED.document WHERE opencircle_forum_${key}.thread_id=EXCLUDED.thread_id`, [row.id, id, JSON.stringify(row), at]);
          }
        }
        for (const [voter, option] of Object.entries(data.votes)) if (before.votes[voter] !== option) await client.query("INSERT INTO opencircle_forum_votes (thread_id,voter_id,option_id) VALUES ($1,$2,$3) ON CONFLICT (thread_id,voter_id) DO UPDATE SET option_id=EXCLUDED.option_id", [id, voter, option]);
        for (const [key, fingerprint] of Object.entries(data.requests)) if (!before.requests[key]) await client.query("INSERT INTO opencircle_forum_requests (thread_id,request_key,fingerprint) VALUES ($1,$2,$3)", [id, key, fingerprint]);
      }
      return result;
    });
  }
}
let store: ForumStore | undefined;
export function getForumStore(): ForumStore {
  if (store) return store;
  if (process.env.DATABASE_URL) store = new PostgresForumStore(createPostgresPool(process.env.DATABASE_URL));
  else if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) throw new HttpError(503, "forum_storage", "Community needs PostgreSQL storage. Configure DATABASE_URL and apply the community migration.");
  else store = new LocalForumStore();
  return store;
}
