import type { Pool } from "pg";
import type { Board } from "../shared/types.js";
import type {
  AppConfig,
  Conflict,
  CreateResult,
  MemberRecord,
  Store,
} from "./store.js";

const CONFLICTS: Record<string, Conflict> = {
  opencircle_members_pkey: "github",
  opencircle_members_whatsapp_key: "whatsapp",
  opencircle_members_nickname_key: "nickname",
};

export class PostgresStore implements Store {
  constructor(private readonly pool: Pool) {}

  async listMembers(): Promise<MemberRecord[]> {
    const { rows } = await this.pool.query<{ record: MemberRecord }>(
      "SELECT record FROM opencircle_members ORDER BY login",
    );
    return rows.map((row) => row.record);
  }

  async getMember(login: string): Promise<MemberRecord | null> {
    const { rows } = await this.pool.query<{ record: MemberRecord }>(
      "SELECT record FROM opencircle_members WHERE login = $1",
      [login],
    );
    return rows[0]?.record ?? null;
  }

  async createMember(member: MemberRecord): Promise<CreateResult> {
    try {
      await this.pool.query(
        "INSERT INTO opencircle_members (login, record) VALUES ($1, $2::jsonb)",
        [member.login, JSON.stringify(member)],
      );
      return { ok: true };
    } catch (error) {
      const failure = error as { code?: string; constraint?: string };
      const conflict = CONFLICTS[failure?.constraint ?? ""];
      if (failure?.code === "23505" && conflict) return { ok: false, conflict };
      throw error;
    }
  }

  async patchMember(login: string, patch: Partial<MemberRecord>): Promise<void> {
    const { login: ignoredLogin, ...fields } = patch;
    if (Object.keys(fields).length === 0) return;
    await this.pool.query(
      "UPDATE opencircle_members SET record = record || $2::jsonb WHERE login = $1",
      [login, JSON.stringify(fields)],
    );
  }

  async mergeAchievements(login: string, awards: Record<string, number>): Promise<void> {
    if (Object.keys(awards).length === 0) return;
    await this.pool.query(
      "UPDATE opencircle_members SET record = jsonb_set(record, '{achievements}', $2::jsonb || coalesce(record->'achievements', '{}'::jsonb)) WHERE login = $1",
      [login, JSON.stringify(awards)],
    );
  }

  async deleteMember(login: string): Promise<void> {
    await this.pool.query("DELETE FROM opencircle_members WHERE login = $1", [login]);
  }

  private async getValue<T>(key: string): Promise<T | null> {
    const { rows } = await this.pool.query<{ value: T }>(
      "SELECT value FROM opencircle_state WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  private async setValue(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO opencircle_state (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }

  getConfig(): Promise<Partial<AppConfig> | null> {
    return this.getValue("config");
  }

  setConfig(config: AppConfig): Promise<void> {
    return this.setValue("config", config);
  }

  getBoard(): Promise<Board | null> {
    return this.getValue("board");
  }

  setBoard(board: Board): Promise<void> {
    return this.setValue("board", board);
  }

  async tryLock(name: string, ttlSeconds: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `WITH maintenance AS MATERIALIZED (
         SELECT pg_try_advisory_xact_lock(1868784499) AS acquired
       ), expired AS (
         DELETE FROM opencircle_locks WHERE expires_at <= NOW() AND name <> $1
         AND (SELECT acquired FROM maintenance)
       )
       INSERT INTO opencircle_locks (name, expires_at)
       VALUES ($1, NOW() + $2 * INTERVAL '1 second')
       ON CONFLICT (name) DO UPDATE SET expires_at = EXCLUDED.expires_at
       WHERE opencircle_locks.expires_at <= NOW()
       RETURNING name`,
      [name, ttlSeconds],
    );
    return rowCount === 1;
  }

  async unlock(name: string): Promise<void> {
    await this.pool.query("DELETE FROM opencircle_locks WHERE name = $1", [name]);
  }

  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { rows } = await this.pool.query<{ count: number }>(
      `WITH maintenance AS MATERIALIZED (
         SELECT pg_try_advisory_xact_lock(1868784500) AS acquired
       ), expired AS (
         DELETE FROM opencircle_rate_limits WHERE expires_at <= NOW() AND key <> $1
         AND (SELECT acquired FROM maintenance)
       )
       INSERT INTO opencircle_rate_limits (key, count, expires_at)
       VALUES ($1, 1, NOW() + $3 * INTERVAL '1 second')
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN opencircle_rate_limits.expires_at <= NOW() THEN 1
                      ELSE LEAST(opencircle_rate_limits.count + 1, $2 + 1) END,
         expires_at = CASE WHEN opencircle_rate_limits.expires_at <= NOW()
                          THEN EXCLUDED.expires_at ELSE opencircle_rate_limits.expires_at END
       RETURNING count`,
      [key, limit, windowSeconds],
    );
    return rows[0].count <= limit;
  }
}
