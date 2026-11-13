import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Pool } from "pg";
import type { ComponentSubmission, ComponentSubmissionStatus } from "../shared/components.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";

/** Open submissions are capped so a flood can't fill storage. */
export const MAX_OPEN_SUBMISSIONS = 500;

export interface ComponentSubmissionStore {
  list(): Promise<ComponentSubmission[]>;
  /** False when the same link was already sent and hasn't been deleted. */
  create(submission: ComponentSubmission): Promise<boolean>;
  review(id: string, status: ComponentSubmissionStatus, reviewer: string): Promise<ComponentSubmission | null>;
  remove(id: string): Promise<void>;
}

const tooMany = () => new HttpError(409, "submissions_full", "The review queue is full. Try again after the admins catch up.");
const reviewed = (record: ComponentSubmission, status: ComponentSubmissionStatus, reviewer: string): ComponentSubmission =>
  status === "pending"
    ? { ...record, status, reviewedAt: undefined, reviewer: undefined }
    : { ...record, status, reviewedAt: Date.now(), reviewer };

export class MemoryComponentSubmissionStore implements ComponentSubmissionStore {
  private readonly file: string | null;
  private readonly records: Map<string, ComponentSubmission>;

  constructor(file: string | null = path.resolve(process.cwd(), ".data/component-submissions.json")) {
    this.file = file;
    const saved = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as ComponentSubmission[] : [];
    if (!Array.isArray(saved)) throw new Error("The local component submissions store is invalid.");
    this.records = new Map(saved.map((record) => [record.id, record]));
  }

  private save() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([...this.records.values()]), { mode: 0o600 });
      renameSync(temporary, this.file);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  async list() {
    return [...this.records.values()];
  }

  async create(submission: ComponentSubmission) {
    const all = [...this.records.values()];
    if (all.some((record) => record.link === submission.link)) return false;
    if (all.filter((record) => record.status === "pending").length >= MAX_OPEN_SUBMISSIONS) throw tooMany();
    this.records.set(submission.id, submission);
    this.save();
    return true;
  }

  async review(id: string, status: ComponentSubmissionStatus, reviewer: string) {
    const record = this.records.get(id);
    if (!record) return null;
    const next = reviewed(record, status, reviewer);
    this.records.set(id, next);
    this.save();
    return next;
  }

  async remove(id: string) {
    if (this.records.delete(id)) this.save();
  }
}

const KEY = "oc:components:submissions";
const LINKS = "oc:components:links";

export class RedisComponentSubmissionStore implements ComponentSubmissionStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async list() {
    return (await this.redis.hvals(KEY) as string[]).map((record) => JSON.parse(record) as ComponentSubmission);
  }

  async create(submission: ComponentSubmission) {
    if ((await this.list()).filter((record) => record.status === "pending").length >= MAX_OPEN_SUBMISSIONS) throw tooMany();
    // The link index claims the link atomically, so two identical submissions can't both land.
    if (!await this.redis.hsetnx(LINKS, submission.link, submission.id)) return false;
    await this.redis.hset(KEY, { [submission.id]: JSON.stringify(submission) });
    return true;
  }

  async review(id: string, status: ComponentSubmissionStatus, reviewer: string) {
    const raw = await this.redis.hget<string>(KEY, id);
    if (!raw) return null;
    const next = reviewed(JSON.parse(raw) as ComponentSubmission, status, reviewer);
    await this.redis.hset(KEY, { [id]: JSON.stringify(next) });
    return next;
  }

  async remove(id: string) {
    const raw = await this.redis.hget<string>(KEY, id);
    if (!raw) return;
    await this.redis.hdel(KEY, id);
    await this.redis.hdel(LINKS, (JSON.parse(raw) as ComponentSubmission).link);
  }
}

export class PostgresComponentSubmissionStore implements ComponentSubmissionStore {
  constructor(private readonly pool: Pool) {}

  async list() {
    const { rows } = await this.pool.query<{ record: ComponentSubmission }>("SELECT record FROM opencircle_component_submissions ORDER BY created_at DESC");
    return rows.map((row) => row.record);
  }

  async create(submission: ComponentSubmission) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(1868784510)");
      const { rows } = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM opencircle_component_submissions WHERE status = 'pending'");
      if (rows[0].count >= MAX_OPEN_SUBMISSIONS) throw tooMany();
      const { rowCount } = await client.query(
        "INSERT INTO opencircle_component_submissions (id, link, status, created_at, record) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT DO NOTHING",
        [submission.id, submission.link, submission.status, submission.createdAt, JSON.stringify(submission)],
      );
      await client.query("COMMIT");
      return rowCount === 1;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async review(id: string, status: ComponentSubmissionStatus, reviewer: string) {
    const { rows } = await this.pool.query<{ record: ComponentSubmission }>("SELECT record FROM opencircle_component_submissions WHERE id = $1", [id]);
    if (!rows[0]) return null;
    const next = reviewed(rows[0].record, status, reviewer);
    await this.pool.query("UPDATE opencircle_component_submissions SET status = $2, record = $3::jsonb WHERE id = $1", [id, status, JSON.stringify(next)]);
    return next;
  }

  async remove(id: string) {
    await this.pool.query("DELETE FROM opencircle_component_submissions WHERE id = $1", [id]);
  }
}

let store: ComponentSubmissionStore | undefined;

export function getComponentSubmissionStore(): ComponentSubmissionStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (process.env.DATABASE_URL) store = new PostgresComponentSubmissionStore(createPostgresPool(process.env.DATABASE_URL));
  else if (url && token) store = new RedisComponentSubmissionStore(url, token);
  else if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new HttpError(503, "storage_missing", "Storage isn't configured yet. Set DATABASE_URL for Neon Postgres or connect Upstash Redis.");
  else store = new MemoryComponentSubmissionStore();
  return store;
}
