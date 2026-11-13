import type { Board } from "../../shared/types";
import type { AppConfig, CreateResult, MemberRecord, Store } from "../../server/store";

export class TestStore implements Store {
  private members = new Map<string, MemberRecord>();
  private config: AppConfig | null = null;
  private board: Board | null = null;
  private locks = new Map<string, number>();
  private limits = new Map<string, { count: number; expiresAt: number }>();

  async listMembers(): Promise<MemberRecord[]> {
    return structuredClone([...this.members.values()]);
  }

  async getMember(login: string): Promise<MemberRecord | null> {
    return structuredClone(this.members.get(login) ?? null);
  }

  async createMember(member: MemberRecord): Promise<CreateResult> {
    if (this.members.has(member.login)) return { ok: false, conflict: "github" };
    for (const existing of this.members.values()) {
      if (existing.whatsapp === member.whatsapp) return { ok: false, conflict: "whatsapp" };
      if (existing.nickname.toLowerCase() === member.nickname.toLowerCase()) return { ok: false, conflict: "nickname" };
    }
    this.members.set(member.login, structuredClone(member));
    return { ok: true };
  }

  async patchMember(login: string, patch: Partial<MemberRecord>): Promise<void> {
    const member = this.members.get(login);
    if (member) this.members.set(login, { ...member, ...structuredClone(patch) });
  }

  async mergeAchievements(login: string, awards: Record<string, number>): Promise<void> {
    const member = this.members.get(login);
    if (!member || Object.keys(awards).length === 0) return;
    this.members.set(login, { ...member, achievements: { ...awards, ...(member.achievements ?? {}) } });
  }

  async deleteMember(login: string): Promise<void> {
    this.members.delete(login);
  }

  async getConfig(): Promise<AppConfig | null> {
    return structuredClone(this.config);
  }

  async setConfig(config: AppConfig): Promise<void> {
    this.config = structuredClone(config);
  }

  async getBoard(): Promise<Board | null> {
    return structuredClone(this.board);
  }

  async setBoard(board: Board): Promise<void> {
    this.board = structuredClone(board);
  }

  async tryLock(name: string, ttlSeconds: number): Promise<boolean> {
    if ((this.locks.get(name) ?? 0) > Date.now()) return false;
    this.locks.set(name, Date.now() + ttlSeconds * 1000);
    return true;
  }

  async unlock(name: string): Promise<void> {
    this.locks.delete(name);
  }

  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const saved = this.limits.get(key);
    const counter = saved && saved.expiresAt > now ? saved : { count: 0, expiresAt: now + windowSeconds * 1000 };
    counter.count += 1;
    this.limits.set(key, counter);
    return counter.count <= limit;
  }
}
