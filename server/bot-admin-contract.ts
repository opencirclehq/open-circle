import type { BotAdminResource, BotAdminResponses } from "../shared/bot-admin.js";

type Decoder = (value: unknown) => unknown;
const fail = (): never => { throw new Error("Invalid bot admin response"); };
const text: Decoder = (value) => typeof value === "string" && value.length <= 12000 ? value : fail();
const number: Decoder = (value) => typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15 ? value : fail();
const bool: Decoder = (value) => typeof value === "boolean" ? value : fail();
const nullable = (decode: Decoder): Decoder => (value) => value === null ? null : decode(value);
const optional = (decode: Decoder): Decoder => (value) => value === undefined ? undefined : decode(value);
const array = (decode: Decoder): Decoder => (value) => Array.isArray(value) && value.length <= 20000 ? value.map(decode) : fail();
const object = (fields: Record<string, Decoder>): Decoder => (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(fields).map(([key, decode]) => [key, decode(record[key])]).filter(([, entry]) => entry !== undefined));
};
const oneOf = (...values: string[]): Decoder => (value) => typeof value === "string" && values.includes(value) ? value : fail();
const fields = (decode: Decoder, ...keys: string[]) => Object.fromEntries(keys.map((key) => [key, decode]));
const counts = object(fields(number, "messages", "replies", "media", "pollVotes", "messagesReactedTo", "reactionAdds", "reactionRemovals", "reactionsReceived"));
const engagement = {
  startedAt: nullable(number), week: text, warnings: number, enforcement: bool, total: counts, weekly: counts,
};
const policy = object({
  enabled: bool, timezone: text, welcomeTimes: array(text),
  ...fields(number, "quietStart", "quietEnd", "graceDays", "target", "reviewPeers", "periodDays", "reminderDays", "warningDays", "removalDays"),
  quietStartMinute: optional(number), quietEndMinute: optional(number),
});
const settings = object({
  ...fields(bool, "groupSchedule", "summariesEnabled", "mentorMatching", "sessionsEnabled"),
  ...fields(text, "summaryTime", "announcementsJid", "helpTime", "demoTime"),
  ...fields(number, "mentorWaitHours", "helpDay", "demoDay", "sessionMinutes"),
  repositoriesEnabled: optional(bool), pinRepositories: optional(bool), weeklyBoardEnabled: optional(bool),
});
const state = object({
  policy, tracking: bool, botAdmin: bool, announced: bool,
  members: array(object({
    ...fields(text, "id", "name", "contact"), ...fields(bool, "active", "welcomePending", "linked", "enabled", "tracking", "removalReview"),
    login: nullable(text), warnings: array(number),
    ...fields(number, "contributions", "reviewPeers", "target", "requiredReviewPeers", "inactiveDays", "graceRemainingDays", "pendingContributions"),
    awayUntil: nullable(number), awayRequestedDays: nullable(number), engagement: optional(object(engagement)),
  })),
  projects: array(object({
    ...fields(text, "id", "owner", "title", "url"), createdAt: number, status: oneOf("pending", "approved", "closed"), reviews: number, assignedTo: array(text), feedbackWanted: optional(text), skills: optional(array(text)),
  })),
  help: array(object({ ...fields(text, "id", "owner", "question"), createdAt: number, status: oneOf("open", "resolved"), skills: optional(array(text)), assignedTo: optional(array(text)) })),
  contributions: array(object({ ...fields(text, "id", "by", "for", "targetId", "text"), kind: oneOf("review", "answer"), status: oneOf("pending", "approved", "rejected"), createdAt: number })),
  cases: array(object({ ...fields(text, "id", "memberId", "member", "reason", "status"), kind: oneOf("inactive", "low", "spam"), eligible: bool, blockedReason: nullable(text) })),
  outbox: array(object({ ...fields(text, "id", "status", "kind", "recipient", "text"), createdAt: number, error: nullable(text) })),
  audit: array(object({ at: number, action: text, detail: text })),
  community: optional(object({
    settings,
    repositories: array(object({
      ...fields(text, "id", "owner", "fullName", "url", "license", "summary", "helpWanted", "reason"), ...fields(bool, "fork", "tagOwner", "needsHelp"),
      issues: array(text), skills: array(text), status: oneOf("pending", "approved", "rejected", "closed"), pinStatus: oneOf("idle", "pending", "pinning", "pinned", "uncertain", "skipped"),
      createdAt: number, checkedAt: number, announcedAt: nullable(number), followedUpAt: nullable(number),
    })),
    groupControl: object({ overrideOpen: nullable(bool), overrideUntil: nullable(number), status: oneOf("idle", "pending", "uncertain"), error: nullable(text), observedOpen: nullable(bool) }),
    updates: array(object({ ...fields(text, "id", "date", "title", "text"), createdAt: number, groupSentAt: nullable(number) })),
    sessions: array(object({ id: text, title: text, startsAt: number, endsAt: number })),
    mentors: array(object({ login: text, skills: array(text), weeklyLimit: number, available: bool })),
    metrics: object(fields(number, "newLinkedMembers", "firstContributors", "confirmedContributions", "openQuestions", "resolvedQuestions", "projectsWithFeedback")),
  })),
  engagement: optional(object({
    generatedAt: number, startedAt: nullable(number), timezone: text, enforcement: bool, schedule: text,
    weeks: array(object({ key: text, complete: bool, observedMs: number, members: array(object({ memberId: text, counts, warnings: array(object({ stage: number, at: number })), exempt: bool, removal: text })) })),
    members: array(object({ ...engagement, id: text, name: text, active: bool, admin: bool, engaged: bool })),
  })),
});

const connection = object({
  state: oneOf("disconnected", "connecting", "qr_ready", "connected"),
  account: nullable(object({ name: nullable(text), phone: nullable(text) })),
  qrImage: nullable((value) => typeof value === "string" && value.length <= 200000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : fail()),
  groupJid: nullable(text),
});
const decoders: Record<BotAdminResource, Decoder> = { state, status: connection, groups: array(object({ jid: text, name: text })), joins: array(object({ jid: text })) };

export function decodeBotAdmin<K extends BotAdminResource>(resource: K, value: unknown): BotAdminResponses[K] {
  return decoders[resource](value) as BotAdminResponses[K];
}
