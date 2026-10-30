export interface CoordinationPolicy {
  enabled: boolean;
  timezone: string;
  welcomeTimes: string[];
  quietStart: number;
  quietEnd: number;
  quietStartMinute?: number;
  quietEndMinute?: number;
  graceDays: number;
  target: number;
  reviewPeers: number;
  periodDays: number;
  reminderDays: number;
  warningDays: number;
  removalDays: number;
}

export const HELPER_POLICY = {
  windowDays: 28,
  contributionPoints: 20,
  peerPoints: 5,
  dailyLimit: 3,
  perPeerLimit: 2,
  perPeerWindowDays: 30,
  reputationCap: 20,
} as const;

export interface HelperScore {
  login: string;
  points: number;
  contributions: number;
  peers: number;
}

export interface HelperLeaderboard {
  version: 1;
  generatedAt: number;
  windowStartedAt: number;
  members: HelperScore[];
}

export function isHelperLeaderboard(value: unknown): value is HelperLeaderboard {
  if (!value || typeof value !== "object") return false;
  const state = value as HelperLeaderboard;
  if (state.version !== 1 || !Number.isSafeInteger(state.generatedAt) || !Number.isSafeInteger(state.windowStartedAt) || state.windowStartedAt !== state.generatedAt - HELPER_POLICY.windowDays * 86400000 || !Array.isArray(state.members) || state.members.length > 10000) return false;
  const logins = new Set<string>();
  return state.members.every((member) => {
    if (!member || typeof member.login !== "string" || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(member.login) || logins.has(member.login.toLowerCase())) return false;
    logins.add(member.login.toLowerCase());
    return [member.points, member.contributions, member.peers].every((number) => Number.isSafeInteger(number) && number >= 0)
      && member.contributions <= (HELPER_POLICY.windowDays + 1) * HELPER_POLICY.dailyLimit
      && member.peers <= member.contributions && member.contributions <= member.peers * HELPER_POLICY.perPeerLimit
      && member.points === member.contributions * HELPER_POLICY.contributionPoints + member.peers * HELPER_POLICY.peerPoints;
  });
}

export const RANKING_PERIODS = ["all", "7d", "30d"] as const;
export type RankingPeriod = typeof RANKING_PERIODS[number];
export type HelperPeriodScores = Record<RankingPeriod, Omit<HelperScore, "login">>;

export function rankingWindowStart(period: RankingPeriod, now: number): number {
  return period === "all" ? 0 : now - (period === "7d" ? 7 : 30) * 86_400_000;
}

export function parseRankingPeriod(value: unknown): RankingPeriod {
  return value === "7d" || value === "30d" ? value : "all";
}

export interface HelperHistory {
  version: 2;
  generatedAt: number;
  periods: Record<RankingPeriod, { windowStartedAt: number; members: HelperScore[] }>;
}

export function isHelperHistory(value: unknown): value is HelperHistory {
  if (!value || typeof value !== "object") return false;
  const state = value as HelperHistory;
  if (state.version !== 2 || !Number.isSafeInteger(state.generatedAt) || state.generatedAt <= 0 || !state.periods || typeof state.periods !== "object") return false;
  const scores = new Map<string, HelperScore>();
  for (const period of RANKING_PERIODS) {
    const snapshot = state.periods[period];
    const start = rankingWindowStart(period, state.generatedAt);
    if (!snapshot || snapshot.windowStartedAt !== start || !Array.isArray(snapshot.members) || snapshot.members.length > 10000) return false;
    const logins = new Set<string>();
    for (const member of snapshot.members) {
      if (!member || typeof member.login !== "string" || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(member.login)) return false;
      const login = member.login.toLowerCase();
      if (logins.has(login)) return false;
      logins.add(login);
      if (![member.points, member.contributions, member.peers].every((number) => Number.isSafeInteger(number) && number >= 0)
        || member.contributions > (Math.floor((state.generatedAt - start) / 86_400_000) + 1) * HELPER_POLICY.dailyLimit
        || member.peers > member.contributions
        || (period !== "all" && member.contributions > member.peers * HELPER_POLICY.perPeerLimit)
        || member.points !== member.contributions * HELPER_POLICY.contributionPoints + member.peers * HELPER_POLICY.peerPoints) return false;
      if (period === "all") scores.set(login, member);
      else {
        const total = scores.get(login);
        if (!total || member.points > total.points || member.contributions > total.contributions || member.peers > total.peers) return false;
      }
    }
    if (period !== "all" && logins.size !== scores.size) return false;
  }
  const weeks = new Map(state.periods["7d"].members.map((member) => [member.login.toLowerCase(), member]));
  return state.periods["30d"].members.every((month) => {
    const week = weeks.get(month.login.toLowerCase())!;
    return week.points <= month.points && week.contributions <= month.contributions && week.peers <= month.peers;
  });
}

export interface InteractionCounts {
  messages: number; replies: number; media: number; pollVotes: number;
  messagesReactedTo: number; reactionAdds: number; reactionRemovals: number; reactionsReceived: number;
}

export interface ActivitySummary {
  starSupport?: { members: number | null; points: number | null; updatedAt: number | null };
  engagement?: {
    startedAt: number | null; week: string; warnings: number; enforcement: boolean;
    total: InteractionCounts; weekly: InteractionCounts;
  };
  linked: boolean;
  login: string | null;
  enabled: boolean;
  tracking: boolean;
  contributions: number;
  reviewPeers: number;
  target: number;
  requiredReviewPeers: number;
  inactiveDays: number;
  graceRemainingDays: number;
  awayUntil: number | null;
  awayRequestedDays: number | null;
  pendingContributions: number;
  removalReview: boolean;
}

export interface CoordinationProject {
  id: string;
  owner: string;
  title: string;
  url: string;
  createdAt: number;
  status: "pending" | "approved" | "closed";
  reviews: number;
  assignedTo: string[];
  feedbackWanted?: string;
  skills?: string[];
}

export interface CoordinationHelp {
  id: string;
  owner: string;
  question: string;
  createdAt: number;
  status: "open" | "resolved";
  skills?: string[];
  assignedTo?: string[];
}

export interface CoordinationContribution {
  id: string;
  by: string;
  for: string;
  kind: "review" | "answer";
  targetId: string;
  text: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface ParticipationState {
  activity: ActivitySummary;
  projects: CoordinationProject[];
  help: CoordinationHelp[];
  contributions: CoordinationContribution[];
  community?: MemberCommunityState;
}

export interface LinkChallenge {
  id: string;
  code: string;
  expiresAt: number;
  botChatUrl?: string;
}

export type ParticipationAction =
  | { action: "project"; title: string; url: string; feedbackWanted?: string; skills?: string[] }
  | { action: "review"; projectId: string; text: string }
  | { action: "help"; question: string; skills?: string[] }
  | { action: "answer"; helpId: string; text: string }
  | { action: "confirm"; id: string; approve: boolean }
  | { action: "away"; days: number }
  | { action: "close"; id: string }
  | { action: "mentor"; available: boolean; skills: string[]; weeklyLimit: number }
  | { action: "decline-help"; id: string }
  | { action: "repository"; url: string; summary: string; helpWanted: string; issues: string[]; skills: string[]; permission: boolean; tagOwner: boolean }
  | { action: "repository-progress"; id: string; needsHelp: boolean };

export interface RepositorySubmission {
  id: string;
  owner: string;
  fullName: string;
  url: string;
  license: string;
  fork: boolean;
  summary: string;
  helpWanted: string;
  issues: string[];
  skills: string[];
  tagOwner: boolean;
  status: "pending" | "approved" | "rejected" | "closed";
  reason: string;
  needsHelp: boolean;
  createdAt: number;
  checkedAt: number;
  announcedAt: number | null;
  followedUpAt: number | null;
  pinStatus: "idle" | "pending" | "pinning" | "pinned" | "uncertain" | "skipped";
}

export interface CommunitySettings {
  groupSchedule: boolean;
  summariesEnabled: boolean;
  mentorMatching: boolean;
  sessionsEnabled: boolean;
  summaryTime: string;
  announcementsJid: string;
  mentorWaitHours: number;
  helpDay: number;
  helpTime: string;
  demoDay: number;
  demoTime: string;
  sessionMinutes: number;
  repositoriesEnabled?: boolean;
  pinRepositories?: boolean;
  weeklyBoardEnabled?: boolean;
}

export interface CommunityUpdate {
  id: string;
  date: string;
  title: string;
  text: string;
  createdAt: number;
  groupSentAt: number | null;
}

export interface CommunitySession {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
}

export interface MentorPreferences {
  available: boolean;
  skills: string[];
  weeklyLimit: number;
}

export interface MemberCommunityState {
  timezone: string;
  quietStart: number;
  quietEnd: number;
  quietStartMinute?: number;
  quietEndMinute?: number;
  groupSchedule: boolean;
  updates: CommunityUpdate[];
  sessions: CommunitySession[];
  mentor: MentorPreferences;
  assignedHelp: string[];
  repositories?: RepositorySubmission[];
}

export function isMemberCommunityState(value: unknown): value is MemberCommunityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as MemberCommunityState;
  const timestamp = (input: unknown) => typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 8.64e15;
  if (typeof state.timezone !== "string" || typeof state.groupSchedule !== "boolean" || ![state.quietStart, state.quietEnd].every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)) return false;
  if (![state.quietStartMinute ?? 0, state.quietEndMinute ?? 0].every((minute) => Number.isInteger(minute) && minute >= 0 && minute <= 59)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: state.timezone }); } catch { return false; }
  if (!Array.isArray(state.updates) || state.updates.length > 60 || !state.updates.every((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.text === "string" && typeof entry.date === "string" && timestamp(entry.createdAt) && (entry.groupSentAt === null || timestamp(entry.groupSentAt)))) return false;
  if (!Array.isArray(state.sessions) || state.sessions.length > 4 || !state.sessions.every((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string" && timestamp(entry.startsAt) && timestamp(entry.endsAt) && entry.endsAt > entry.startsAt)) return false;
  if (!state.mentor || typeof state.mentor !== "object" || typeof state.mentor.available !== "boolean" || !Number.isInteger(state.mentor.weeklyLimit) || state.mentor.weeklyLimit < 1 || state.mentor.weeklyLimit > 5 || !Array.isArray(state.mentor.skills) || state.mentor.skills.length > 8 || !state.mentor.skills.every((skill) => typeof skill === "string" && skill.length <= 30)) return false;
  if (state.repositories !== undefined && (!Array.isArray(state.repositories) || !state.repositories.every(isRepositorySubmission))) return false;
  return Array.isArray(state.assignedHelp) && state.assignedHelp.every((entry) => typeof entry === "string");
}

export function isRepositorySubmission(value: unknown): value is RepositorySubmission {
  if (!value || typeof value !== "object") return false;
  const entry = value as RepositorySubmission;
  return [entry.id, entry.owner, entry.fullName, entry.url, entry.license, entry.summary, entry.helpWanted, entry.reason].every((item) => typeof item === "string")
    && /^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(entry.url)
    && [entry.fork, entry.tagOwner, entry.needsHelp].every((item) => typeof item === "boolean")
    && ["pending", "approved", "rejected", "closed"].includes(entry.status)
    && ["idle", "pending", "pinning", "pinned", "uncertain", "skipped"].includes(entry.pinStatus)
    && [entry.createdAt, entry.checkedAt].every((item) => typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 8.64e15)
    && [entry.announcedAt, entry.followedUpAt].every((item) => item === null || typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 8.64e15)
    && Array.isArray(entry.issues) && entry.issues.length <= 3 && entry.issues.every((item) => typeof item === "string" && /^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9_.-]+\/issues\/[1-9]\d*$/i.test(item))
    && Array.isArray(entry.skills) && entry.skills.length <= 8 && entry.skills.every((item) => typeof item === "string" && item.length <= 30);
}

export interface CommunityAdminState {
  settings: CommunitySettings;
  repositories: RepositorySubmission[];
  groupControl: { overrideOpen: boolean | null; overrideUntil: number | null; status: "idle" | "pending" | "uncertain"; error: string | null; observedOpen: boolean | null };
  updates: CommunityUpdate[];
  sessions: CommunitySession[];
  mentors: { login: string; skills: string[]; weeklyLimit: number; available: boolean }[];
  metrics: { newLinkedMembers: number; firstContributors: number; confirmedContributions: number; openQuestions: number; resolvedQuestions: number; projectsWithFeedback: number };
}

export interface CoordinationAdminState {
  engagement?: {
    generatedAt: number; startedAt: number | null; timezone: string; enforcement: boolean; schedule: string;
    weeks: { key: string; complete: boolean; observedMs: number; members: { memberId: string; counts: InteractionCounts; warnings: { stage: number; at: number }[]; exempt: boolean; removal: string }[] }[];
    members: { id: string; name: string; active: boolean; admin: boolean; startedAt: number | null; week: string; total: InteractionCounts; weekly: InteractionCounts; warnings: number; enforcement: boolean; engaged: boolean }[];
  };
  community?: CommunityAdminState;
  policy: CoordinationPolicy;
  tracking: boolean;
  botAdmin: boolean;
  announced: boolean;
  members: (ActivitySummary & { id: string; name: string; contact: string; active: boolean; welcomePending: boolean; warnings: number[] })[];
  projects: CoordinationProject[];
  help: CoordinationHelp[];
  contributions: CoordinationContribution[];
  cases: { id: string; memberId: string; member: string; reason: string; kind: "inactive" | "low" | "spam"; status: string; eligible: boolean; blockedReason: string | null }[];
  outbox: { id: string; status: string; kind: string; recipient: string; text: string; createdAt: number; error: string | null }[];
  audit: { at: number; action: string; detail: string }[];
}
