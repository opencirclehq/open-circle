import { createHash } from "node:crypto";
import { COMMUNITY_ACTIVITY_POLICY, emptyCommunityActivity, type CommunityActivity, type CommunityActivityScore } from "../shared/community-activity.js";
import { RANKING_PERIODS, rankingWindowStart, type RankingPeriod } from "../shared/coordination.js";
import type { ForumAggregate } from "../shared/forum.js";

const normalized = (text: string) => text.normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const fingerprint = (text: string) => createHash("sha256").update(normalized(text)).digest("hex");
const activityKey = (event: CommunityActivity) => `${event.kind}:${event.targetId}:${event.actorId}`;

export function forumActivity(data: Pick<ForumAggregate, "thread" | "comments" | "votes">, addedAt: number | null = null): CommunityActivity[] {
  const t = data.thread;
  if (!t?.published) return [];
  const saved = new Map((t.activity ?? []).map((event) => [activityKey(event), event]));
  const events = new Map<string, CommunityActivity>([...saved].map(([key, event]) => [key, { ...event, active: false }]));
  const add = (event: Omit<CommunityActivity, "threadId">, active = true) => {
    const item = { ...event, threadId: t.id };
    const key = activityKey(item);
    events.set(key, { ...saved.get(key) ?? item, active: !t.hidden && active });
  };
  add({ kind: "post", actorId: t.author.id, targetId: t.id, at: t.publishedAt ?? t.createdAt, fingerprint: fingerprint(`${t.published.title}\n${t.published.body}`) });
  const comments = new Map(data.comments.map((comment) => [comment.id, comment]));
  for (const comment of data.comments) {
    const visible = !comment.hidden && !comments.get(comment.parentId ?? "")?.hidden;
    const parentAuthor = comment.parentId ? comments.get(comment.parentId)?.author.id : t.author.id;
    if (comment.author.id !== parentAuthor && normalized(comment.body).length >= COMMUNITY_ACTIVITY_POLICY.minimumCommentLength) {
      add({ kind: "comment", actorId: comment.author.id, targetId: comment.id, at: comment.createdAt, fingerprint: fingerprint(comment.body) }, visible);
    }
    for (const actorId of comment.likedBy ?? []) if (actorId !== comment.author.id) add({ kind: "like", actorId, targetId: comment.id, at: addedAt }, visible);
  }
  for (const actorId of t.likedBy ?? []) if (actorId !== t.author.id) add({ kind: "like", actorId, targetId: t.id, at: addedAt });
  if (t.poll) for (const [actor, option] of Object.entries(data.votes)) {
    const actorId = Number(actor);
    if (actorId !== t.author.id && t.poll.options.some((item) => item.id === option)) add({ kind: "vote", actorId, targetId: t.id, at: addedAt });
  }
  return [...events.values()];
}

export function retainForumActivity(data: ForumAggregate, addedAt: number | null = null) {
  if (!data.thread) return;
  const saved = new Map((data.thread.activity ?? []).map((event) => [activityKey(event), event]));
  const complete = { thread: { ...data.thread, hidden: false }, comments: data.comments.map((comment) => ({ ...comment, hidden: false })), votes: data.votes };
  for (const event of forumActivity(complete, addedAt)) if (!saved.has(activityKey(event))) {
    const stored = { ...event };
    delete stored.active;
    saved.set(activityKey(event), stored);
  }
  data.thread.activity = [...saved.values()];
}

export function communityActivityScores(events: readonly CommunityActivity[], now: number): Map<number, Record<RankingPeriod, CommunityActivityScore>> {
  const scores = new Map<number, Record<RankingPeriod, CommunityActivityScore>>();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const daily = new Map<string, number>();
  const threads = new Map<string, number>();
  const fields = { post: "posts", comment: "comments", like: "likes", vote: "votes" } as const;
  const sorted = [...events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || activityKey(a).localeCompare(activityKey(b)));
  for (const event of sorted) {
    const key = activityKey(event);
    if (!Number.isSafeInteger(event.actorId) || event.actorId <= 0 || seen.has(key) || (event.at !== null && (!Number.isSafeInteger(event.at) || event.at <= 0 || event.at > now))) continue;
    seen.add(key);
    const duplicate = event.fingerprint ? `${event.actorId}:${event.kind}:${event.fingerprint}` : null;
    if (duplicate && duplicates.has(duplicate)) continue;
    if (duplicate) duplicates.add(duplicate);
    if (event.active === false) continue;
    const threadKey = `${event.actorId}:${event.threadId}`;
    if (event.kind === "comment" && (threads.get(threadKey) ?? 0) >= COMMUNITY_ACTIVITY_POLICY.commentsPerThread) continue;
    const day = event.at === null ? "legacy" : Math.floor(event.at / 86_400_000);
    const dailyKey = `${event.actorId}:${event.kind}:${day}`;
    const policy = COMMUNITY_ACTIVITY_POLICY[event.kind];
    if ((daily.get(dailyKey) ?? 0) >= policy.dailyLimit) continue;
    daily.set(dailyKey, (daily.get(dailyKey) ?? 0) + 1);
    if (event.kind === "comment") threads.set(threadKey, (threads.get(threadKey) ?? 0) + 1);
    let member = scores.get(event.actorId);
    if (!member) {
      member = { all: emptyCommunityActivity(), "7d": emptyCommunityActivity(), "30d": emptyCommunityActivity() };
      scores.set(event.actorId, member);
    }
    for (const period of RANKING_PERIODS) if (period === "all" || event.at !== null && event.at >= rankingWindowStart(period, now)) {
      member[period].points += policy.points;
      member[period][fields[event.kind]]++;
    }
  }
  return scores;
}
