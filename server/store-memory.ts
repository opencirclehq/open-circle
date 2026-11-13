import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Board } from "../shared/types.js";
import type { AppConfig, CreateResult, MemberRecord, Store } from "./store.js";

/**
 * Local development only. Persists to .data/dev-store.json so restarting the
 * dev server keeps your test sign-ups. Production refuses to use it.
 */
interface Snapshot {
  members: Record<string, MemberRecord>;
  config: Partial<AppConfig> | null;
  board: Board | null;
}

const FILE = path.resolve(process.cwd(), ".data/dev-store.json");

interface RateWindow {
  count: number;
  expiresAt: number;
}

// Vite re-evaluates server modules on edit; keep one copy of the data across reloads.
const globalStore = globalThis as typeof globalThis & {
  __devechleonStore?: Snapshot;
  __devechleonLocks?: Map<string, number>;
  __openCircleRateLimits?: Map<string, RateWindow>;
};

function load(): Snapshot {
  if (globalStore.__devechleonStore) return globalStore.__devechleonStore;
  let data: Snapshot = { members: {}, config: null, board: null };
  if (existsSync(FILE)) {
    try {
      data = JSON.parse(readFileSync(FILE, "utf8")) as Snapshot;
    } catch {
      // A corrupt dev file shouldn't block the dev server; start empty.
    }
  }
  globalStore.__devechleonStore = data;
  return data;
}

function save(data: Snapshot) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export class MemoryStore implements Store {
  private data = load();
  private locks = (globalStore.__devechleonLocks ??= new Map());
  private rateLimits = (globalStore.__openCircleRateLimits ??= new Map());

  async listMembers() {
    return Object.values(this.data.members).map((m) => ({ ...m }));
  }

  async getMember(login: string) {
    const m = this.data.members[login];
    return m ? { ...m } : null;
  }

  async createMember(member: MemberRecord): Promise<CreateResult> {
    const all = Object.values(this.data.members);
    if (this.data.members[member.login]) return { ok: false, conflict: "github" };
    if (all.some((m) => m.whatsapp === member.whatsapp)) return { ok: false, conflict: "whatsapp" };
    if (all.some((m) => m.nickname.toLowerCase() === member.nickname.toLowerCase())) {
      return { ok: false, conflict: "nickname" };
    }
    this.data.members[member.login] = { ...member };
    save(this.data);
    return { ok: true };
  }

  async patchMember(login: string, patch: Partial<MemberRecord>) {
    const m = this.data.members[login];
    if (!m) return;
    this.data.members[login] = { ...m, ...patch };
    save(this.data);
  }

  async mergeAchievements(login: string, awards: Record<string, number>) {
    const m = this.data.members[login];
    if (!m || Object.keys(awards).length === 0) return;
    this.data.members[login] = { ...m, achievements: { ...awards, ...(m.achievements ?? {}) } };
    save(this.data);
  }

  async deleteMember(login: string) {
    delete this.data.members[login];
    save(this.data);
  }

  async getConfig() {
    return this.data.config;
  }

  async setConfig(config: AppConfig) {
    this.data.config = config;
    save(this.data);
  }

  async getBoard() {
    return this.data.board;
  }

  async setBoard(board: Board) {
    this.data.board = board;
    save(this.data);
  }

  async tryLock(name: string, ttlSeconds: number) {
    const now = Date.now();
    if ((this.locks.get(name) ?? 0) > now) return false;
    this.locks.set(name, now + ttlSeconds * 1000);
    return true;
  }

  async unlock(name: string) {
    this.locks.delete(name);
  }

  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    for (const [name, window] of this.rateLimits) {
      if (window.expiresAt <= now) this.rateLimits.delete(name);
    }
    const window = this.rateLimits.get(key) ?? { count: 0, expiresAt: now + windowSeconds * 1000 };
    window.count += 1;
    this.rateLimits.set(key, window);
    return window.count <= limit;
  }
}
