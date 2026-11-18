import { Redis } from "@upstash/redis";
import type { Board } from "../shared/types.js";
import {
  decodeMember,
  encodeMember,
  type AppConfig,
  type Conflict,
  type CreateResult,
  type MemberRecord,
  type Store,
} from "./store.js";

const P = "dv:";
const keys = {
  members: `${P}members`,
  member: (login: string) => `${P}member:${login}`,
  github: (login: string) => `${P}gh:${login}`,
  whatsapp: (e164: string) => `${P}wa:${e164}`,
  nickname: (nick: string) => `${P}nick:${nick.toLowerCase()}`,
  config: `${P}config`,
  board: `${P}board`,
  lock: (name: string) => `${P}lock:${name}`,
  rateLimit: (name: string) => `${P}rate:${name}`,
};

// All three uniqueness claims and the record land together, or nothing does.
const CREATE = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'github' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'whatsapp' end
if redis.call('EXISTS', KEYS[3]) == 1 then return 'nickname' end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('HSET', KEYS[4], unpack(ARGV, 2))
redis.call('SADD', KEYS[5], ARGV[1])
return 'ok'`;

// A stats refresh racing an admin delete must not resurrect half a record.
const PATCH = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV))
return 1`;

// Two award writers merging at once must union, not clobber, their awards.
const MERGE_ACHIEVEMENTS = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local raw = redis.call('HGET', KEYS[1], 'achievements')
local existing = {}
if raw and raw ~= '' then existing = cjson.decode(raw) end
for id, at in pairs(cjson.decode(ARGV[1])) do
  if existing[id] == nil then existing[id] = at end
end
redis.call('HSET', KEYS[1], 'achievements', cjson.encode(existing))
return 1`;

const RATE_LIMIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if count <= tonumber(ARGV[1]) then return 1 end
return 0`;

/**
 * With automaticDeserialization off, Upstash returns HGETALL as a flat
 * [field, value, field, value, …] array rather than an object. Accept both.
 */
function toHash(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return raw as Record<string, string>;
}

export class RedisStore implements Store {
  private redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async listMembers(): Promise<MemberRecord[]> {
    const logins = await this.redis.smembers(keys.members);
    if (logins.length === 0) return [];
    const pipe = this.redis.pipeline();
    for (const login of logins) pipe.hgetall(keys.member(login));
    const hashes = (await pipe.exec()).map(toHash);
    return hashes.filter((h): h is Record<string, string> => Boolean(h?.login)).map(decodeMember);
  }

  async getMember(login: string): Promise<MemberRecord | null> {
    const hash = toHash(await this.redis.hgetall(keys.member(login)));
    return hash?.login ? decodeMember(hash) : null;
  }

  async createMember(member: MemberRecord): Promise<CreateResult> {
    const fields = Object.entries(encodeMember(member)).flat();
    const result = await this.redis.eval(
      CREATE,
      [keys.github(member.login), keys.whatsapp(member.whatsapp), keys.nickname(member.nickname), keys.member(member.login), keys.members],
      [member.login, ...fields],
    );
    return result === "ok" ? { ok: true } : { ok: false, conflict: result as Conflict };
  }

  async patchMember(login: string, patch: Partial<MemberRecord>): Promise<void> {
    const fields = Object.entries(encodeMember(patch)).flat();
    if (fields.length === 0) return;
    await this.redis.eval(PATCH, [keys.member(login)], fields);
  }

  async mergeAchievements(login: string, awards: Record<string, number>): Promise<void> {
    if (Object.keys(awards).length === 0) return;
    await this.redis.eval(MERGE_ACHIEVEMENTS, [keys.member(login)], [JSON.stringify(awards)]);
  }

  async deleteMember(login: string): Promise<void> {
    const member = await this.getMember(login);
    if (!member) return;
    await this.redis
      .multi()
      .srem(keys.members, login)
      .del(keys.member(login), keys.github(login), keys.whatsapp(member.whatsapp), keys.nickname(member.nickname))
      .exec();
  }

  async getConfig(): Promise<Partial<AppConfig> | null> {
    const raw = await this.redis.get<string>(keys.config);
    return raw ? (JSON.parse(raw) as Partial<AppConfig>) : null;
  }

  async setConfig(config: AppConfig): Promise<void> {
    await this.redis.set(keys.config, JSON.stringify(config));
  }

  async getBoard(): Promise<Board | null> {
    const raw = await this.redis.get<string>(keys.board);
    return raw ? (JSON.parse(raw) as Board) : null;
  }

  async setBoard(board: Board): Promise<void> {
    await this.redis.set(keys.board, JSON.stringify(board));
  }

  async tryLock(name: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(keys.lock(name), "1", { nx: true, ex: ttlSeconds })) === "OK";
  }

  async unlock(name: string): Promise<void> {
    await this.redis.del(keys.lock(name));
  }

  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const result = await this.redis.eval(RATE_LIMIT, [keys.rateLimit(key)], [limit, windowSeconds]);
    return Number(result) === 1;
  }
}
