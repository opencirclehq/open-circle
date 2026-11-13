import { createHash, randomUUID } from "node:crypto";
import { forumCategories, FORUM_PAGE_SIZE, type ForumAggregate, type ForumAuthor, type ForumCommand, type ForumComment, type ForumCommentView, type ForumContent, type ForumDetail, type ForumFilter, type ForumPage, type ForumPoll, type ForumSummary, type ForumThread } from "../shared/forum.js";
import type { ParticipationState } from "../shared/coordination.js";
import { getCommunityStore } from "./community-store.js";
import { githubProfile } from "./github-auth.js";
import { adminProfile, requireAdminOrigin } from "./admin-session.js";
import { coordinationRequest } from "./participation.js";
import { getStore } from "./db.js";
import { clientKey } from "./rate-limit.js";
import { HttpError } from "./http.js";
import type { ForumStore } from "./forum-store.js";
import { retainForumActivity } from "./forum-activity.js";

export interface ForumViewer { profile: ForumAuthor; admin: boolean; participation?: ParticipationState }
export const FORUM_HEADERS = { "cache-control": "private, no-store", vary: "Cookie" };
export const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
function invalid(message: string): never { throw new HttpError(400, "forum_invalid", message); }
function missing(): never { throw new HttpError(404, "forum_missing", "This post isn't available."); }
function forbidden(): never { throw new HttpError(403, "forum_forbidden", "You don't have permission to do that."); }
function conflict(): never { throw new HttpError(409, "forum_conflict", "This post changed. Reload it before saving again."); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Send a valid community request.");
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "string") invalid(`Add ${label}.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max || [...clean].some((c) => { const code = c.charCodeAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); })) invalid(`Keep ${label} between ${min} and ${max} characters.`);
  return clean;
}
function content(value: unknown): ForumContent {
  const c = record(value);
  if (!forumCategories.includes(c.category as typeof forumCategories[number])) invalid("Choose a community category.");
  return { title: text(c.title, 5, 160, "a title"), body: text(c.body, 15, 12_000, "an explanation"), category: c.category as ForumContent["category"] };
}
function poll(value: unknown): ForumPoll | null {
  if (value === null || value === undefined) return null;
  const p = record(value);
  if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 6) invalid("Add between two and six poll options.");
  const options = p.options.map((value, index) => ({ id: `option_${index + 1}`, label: text(record(value).label, 1, 120, "each poll option") }));
  if (new Set(options.map((o) => o.label.toLowerCase())).size !== options.length) invalid("Use different poll options.");
  if (p.closesAt !== null && p.closesAt !== undefined && (!Number.isSafeInteger(p.closesAt) || Number(p.closesAt) <= 0 || !Number.isFinite(new Date(Number(p.closesAt)).getTime()))) invalid("Choose a valid poll closing time.");
  return { question: text(p.question, 5, 240, "a poll question"), options, closesAt: p.closesAt == null ? null : Number(p.closesAt), closed: p.closed === true };
}
export async function forumViewer(req: Request, admin = false): Promise<ForumViewer> {
  let profile: ForumAuthor | null;
  if (admin) {
    requireAdminOrigin(req, req.method !== "GET");
    profile = await adminProfile(req, getCommunityStore());
    if (!profile) throw new HttpError(401, "unauthorized", "Sign in to the admin page again.");
  } else {
    profile = await githubProfile(req, getCommunityStore());
    if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to join the community.");
  }
  const store = getStore();
  const write = req.method !== "GET";
  const action = write ? "write" : "read";
  const allowed = await Promise.all([store.rateLimit(`forum:${action}:ip:${clientKey(req)}`, write ? 60 : 180, 60), store.rateLimit(`forum:${action}:account:${profile.id}`, write ? 20 : 90, 60)]);
  if (allowed.some((v) => !v)) throw new HttpError(429, "forum_rate", "Wait a minute before trying again.", undefined, { "retry-after": "60" });
  let participation: ParticipationState | undefined;
  if (!admin) {
    const state = await coordinationRequest<ParticipationState>("profile", { login: profile.login }).catch(() => { throw new HttpError(503, "forum_membership_unavailable", "We cannot check current group membership right now. Try again shortly."); });
    if (state.activity.tracking !== true) throw new HttpError(503, "forum_membership_unavailable", "Group membership checks are paused or out of date. Try again shortly.");
    if (state.activity.linked !== true || (typeof state.activity.login !== "string" || state.activity.login.toLowerCase() !== profile.login.toLowerCase())) throw new HttpError(403, "forum_membership", "Verify your WhatsApp membership from Participation, then try again.");
    participation = state;
  }
  return { profile: { id: profile.id, login: profile.login, ...(profile.name ? { name: profile.name } : {}), avatarUrl: profile.avatarUrl }, admin, participation };
}
export function forumFilter(url: URL, admin: boolean): ForumFilter {
  const page = Number(url.searchParams.get("page") ?? "1");
  const kind = url.searchParams.get("kind") ?? "discussion";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const category = url.searchParams.get("category") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const queue = url.searchParams.get("queue") ?? "pending";
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000 || !["discussion", "question"].includes(kind) || search.length > 150 || (category && !forumCategories.includes(category as ForumContent["category"])) || !["", "open", "resolved"].includes(status) || (admin && !["all", "pending", "reports", "published", "hidden", "drafts"].includes(queue))) invalid("Choose valid community filters.");
  return { kind: kind as ForumFilter["kind"], page, search, category, status, mine: url.searchParams.get("mine") === "1", queue };
}
function visible(thread: ForumThread, viewer: ForumViewer) {
  if (viewer.admin) return;
  if (thread.hidden || (!thread.published && thread.author.id !== viewer.profile.id)) missing();
}
function summary(t: ForumThread, viewer: ForumViewer, count: number, mine = false): ForumSummary {
  const privateView = viewer.admin || t.author.id === viewer.profile.id;
  return {
    id: t.id, kind: t.kind, author: t.author, content: (mine && privateView ? t.revision ?? t.published : t.published ?? t.revision)!, createdAt: t.createdAt,
    updatedAt: t.editedAt ?? t.publishedAt ?? t.createdAt, publishedAt: t.publishedAt, version: privateView ? t.version : 0, edited: t.editedAt !== null,
    pinned: t.pinned, locked: t.locked, resolved: t.resolved, hidden: t.hidden, commentCount: count,
    likeCount: t.likedBy?.length ?? 0, liked: t.likedBy?.includes(viewer.profile.id) ?? false, hasPoll: !!t.poll, publishedTitle: t.published?.title ?? null,
    ...(privateView ? { review: t.review, hasRevision: !!t.revision && !!t.published } : {}),
  };
}
function pollBallot(value: ForumPoll): string { return createHash("sha256").update(JSON.stringify({ question: value.question, options: value.options.map(({ id, label }) => ({ id, label })), closesAt: value.closesAt, closed: value.closed })).digest("hex"); }
function commentView(comment: ForumComment, viewer: ForumViewer): ForumCommentView {
  const { likedBy, ...visible } = comment;
  return { ...visible, likeCount: likedBy?.length ?? 0, liked: likedBy?.includes(viewer.profile.id) ?? false };
}
function detail(data: ForumAggregate, viewer: ForumViewer, page = 1, now = Date.now()): ForumDetail {
  const t = data.thread!;
  visible(t, viewer);
  const visibleComments = data.comments.filter((c) => viewer.admin || (!c.hidden && !data.comments.some((p) => p.id === c.parentId && p.hidden)));
  page = Math.min(page, Math.max(1, Math.ceil(visibleComments.length / FORUM_PAGE_SIZE)));
  const selectedComments = visibleComments.slice((page - 1) * FORUM_PAGE_SIZE, page * FORUM_PAGE_SIZE);
  const ids = new Set(selectedComments.flatMap((c) => c.parentId ? [c.id, c.parentId] : [c.id]));
  const counts = Object.fromEntries((t.poll?.options ?? []).map((o) => [o.id, 0]));
  for (const choice of Object.values(data.votes)) if (choice in counts) counts[choice]++;
  const privateView = viewer.admin || t.author.id === viewer.profile.id;
  return {
    ...summary(t, viewer, visibleComments.length), comments: visibleComments.filter((c) => ids.has(c.id)).map((c) => commentView(c, viewer)), commentTotal: visibleComments.length, commentPage: page,
    poll: t.poll && (t.published || viewer.admin) ? { ...t.poll, ballot: pollBallot(t.poll), counts, total: Object.values(counts).reduce((a, b) => a + b, 0), selected: data.votes[String(viewer.profile.id)] ?? null, open: !!t.published && !t.hidden && !t.poll.closed && (t.poll.closesAt === null || t.poll.closesAt > now) } : null,
    ...(privateView ? { revision: t.revision, reviewReason: t.reviewReason, submittedAt: t.submittedAt } : {}),
    ...(viewer.admin ? { reports: data.reports.map((report) => { const comment = data.comments.find((c) => c.id === report.commentId); return { ...report, ...(comment ? { reportedComment: commentView(comment, viewer) } : {}) }; }), audit: data.audit } : {}),
  };
}
export async function listForum(store: ForumStore, viewer: ForumViewer, filter: ForumFilter): Promise<ForumPage> {
  const data = await store.list(filter, viewer.profile.id, viewer.admin);
  const lastPage = Math.max(1, Math.ceil(data.total / FORUM_PAGE_SIZE));
  if (filter.page > lastPage) return listForum(store, viewer, { ...filter, page: lastPage });
  return { items: data.threads.map(({ thread, commentCount }) => summary(thread, viewer, commentCount, viewer.admin || filter.mine)), total: data.total, page: filter.page, pageSize: FORUM_PAGE_SIZE };
}
export function readForum(store: ForumStore, viewer: ForumViewer, id: string, page = 1): Promise<ForumDetail> {
  if (!uuidPattern.test(id)) missing();
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) invalid("Choose a valid comments page.");
  return store.transact(id, false, (data) => { if (!data.thread) missing(); return detail(data, viewer, page); });
}
export async function commandForum(store: ForumStore, viewer: ForumViewer, input: unknown, now = Date.now()): Promise<ForumDetail> {
  const b = record(input);
  if (!uuidPattern.test(String(b.requestId)) || !["create", "edit", "comment", "vote", "like", "report", "review", "moderate"].includes(String(b.action))) invalid("Reload the form and try again.");
  const command = b as unknown as ForumCommand;
  const id = command.action === "create" ? command.requestId : command.id;
  if (!id || !uuidPattern.test(id)) missing();
  const fingerprint = createHash("sha256").update(JSON.stringify(b)).digest("hex");
  const requestKey = `${viewer.profile.id}:${command.requestId}`;
  return store.transact(id, true, (data) => {
    let t = data.thread;
    if (t) {
      visible(t, viewer);
      if (data.requests[requestKey]) {
        if (data.requests[requestKey] !== fingerprint) throw new HttpError(409, "forum_retry", "That request was already used. Start a new action.");
        return detail(data, viewer, 1, now);
      }
      if (command.action === "create") conflict();
    } else if (command.action !== "create") missing();
    retainForumActivity(data);
    const audit = (action: string, reason: string, snapshot?: ForumContent) => data.audit.push({ id: randomUUID(), actor: viewer.profile, action, reason, at: now, ...(snapshot ? { content: structuredClone(snapshot) } : {}) });
    if (command.action === "create") {
      if (command.kind !== "question" && command.kind !== "discussion") invalid("Choose a discussion or question.");
      const c = content(command.content);
      if (command.publish !== undefined && typeof command.publish !== "boolean") invalid("Choose whether to publish the discussion.");
      if ((!viewer.admin || command.kind === "question") && command.poll) invalid("Only admin discussions can have polls.");
      const publishing = viewer.admin && command.kind === "discussion" && command.publish === true;
      const pending = !viewer.admin || command.kind === "question";
      t = { id, kind: command.kind, author: viewer.profile, createdAt: now, updatedAt: now, version: 1, published: publishing ? c : null, publishedAt: publishing ? now : null, editedAt: null, revision: publishing ? null : c, review: pending ? "pending" : publishing ? "approved" : "draft", reviewReason: "", submittedAt: now, hidden: false, locked: false, pinned: false, resolved: false, poll: viewer.admin && command.kind === "discussion" ? poll(command.poll) : null };
      data.thread = t;
      audit(publishing ? "publish" : pending ? "submit" : "draft", "", c);
    } else {
      if (!t) missing();
      if (["edit", "review", "moderate"].includes(command.action) && (!Number.isSafeInteger(command.version) || command.version !== t.version)) conflict();
      if (command.action === "edit") {
        if (t.author.id !== viewer.profile.id && !viewer.admin) forbidden();
        if ((!viewer.admin || t.kind === "question") && command.poll) invalid("Only admin discussions can have polls.");
        const c = content(command.content);
        if (t.kind === "discussion" && viewer.admin) {
          const nextPoll = poll(command.poll);
          if (Object.keys(data.votes).length && (!nextPoll || !t.poll || pollBallot(nextPoll) !== pollBallot(t.poll))) throw new HttpError(409, "poll_started", "Poll settings cannot change after the first vote.");
          t.poll = nextPoll;
          if (command.publish === true || t.published) { if (t.published) t.editedAt = now; t.published = c; t.publishedAt ??= now; t.revision = null; t.review = "approved"; }
          else { t.revision = c; t.review = "draft"; }
        } else { t.revision = c; t.review = "pending"; t.reviewReason = ""; t.submittedAt = now; }
        audit(t.kind === "question" || !viewer.admin ? "submit-revision" : t.published ? "publish-edit" : "edit-draft", "", c);
      } else if (command.action === "comment") {
        if (!t.published || t.hidden || t.locked) throw new HttpError(409, "forum_locked", "Comments aren't open on this post.");
        const parent = command.parentId ? data.comments.find((c) => c.id === command.parentId && !c.hidden) : null;
        if (command.parentId && (!parent || parent.parentId !== null)) invalid("Reply to a visible top-level comment.");
        data.comments.push({ id: randomUUID(), parentId: parent?.id ?? null, author: viewer.profile, body: text(command.body, 1, 6000, "a comment"), createdAt: now, hidden: false });
      } else if (command.action === "like") {
        if (!t.published || t.hidden) missing();
        if (typeof command.liked !== "boolean") invalid("Choose whether to like this content.");
        let target: ForumThread | ForumComment = t;
        if (command.commentId !== undefined && command.commentId !== null) {
          if (typeof command.commentId !== "string" || !uuidPattern.test(command.commentId)) invalid("Choose a valid comment.");
          const comment = data.comments.find((c) => c.id === command.commentId && !c.hidden && !data.comments.some((parent) => parent.id === c.parentId && parent.hidden));
          if (!comment) missing();
          target = comment;
        }
        const likedBy = target.likedBy ?? [];
        target.likedBy = command.liked ? Array.from(new Set([...likedBy, viewer.profile.id])) : likedBy.filter((id) => id !== viewer.profile.id);
      } else if (command.action === "vote") {
        if (!t.published || t.hidden || !t.poll || t.poll.closed || (t.poll.closesAt !== null && t.poll.closesAt <= now)) throw new HttpError(409, "poll_closed", "Voting is closed on this poll.");
        if (command.ballot !== pollBallot(t.poll)) throw new HttpError(409, "poll_changed", "This poll changed. Reload it before voting. Your vote was not saved.");
        if (!t.poll.options.some((o) => o.id === command.optionId)) invalid("Choose a poll option.");
        data.votes[String(viewer.profile.id)] = command.optionId!;
      } else if (command.action === "report") {
        if (!t.published || t.hidden) missing();
        if (command.commentId && !data.comments.some((c) => c.id === command.commentId && !c.hidden && !data.comments.some((p) => p.id === c.parentId && p.hidden))) missing();
        const reason = text(command.reason, 5, 1000, "a report reason");
        if (!data.reports.some((r) => r.author.id === viewer.profile.id && r.commentId === (command.commentId ?? null) && !r.resolved)) data.reports.push({ id: randomUUID(), commentId: command.commentId ?? null, author: viewer.profile, reason, createdAt: now, resolved: false });
      } else if (command.action === "review") {
        if (!viewer.admin) forbidden();
        if (t.review !== "pending" || !t.revision || !["approve", "reject", "changes"].includes(command.decision ?? "")) conflict();
        const reason = command.decision === "approve" ? command.reason ? text(command.reason, 1, 1000, "a moderation note") : "" : text(command.reason, 5, 1000, "a private explanation");
        audit(`review-${command.decision}`, reason, t.revision);
        if (command.decision === "approve") { if (t.published) t.editedAt = now; t.published = t.revision; t.revision = null; t.publishedAt ??= now; t.review = "approved"; }
        else t.review = command.decision === "reject" ? "rejected" : "changes";
        t.reviewReason = command.decision === "approve" ? "" : reason;
      } else if (command.action === "moderate") {
        const operation = command.operation;
        const resolve = operation === "resolve" || operation === "unresolve";
        if (resolve ? t.kind !== "question" || (!viewer.admin && t.author.id !== viewer.profile.id) || !t.published : !viewer.admin) forbidden();
        const reason = resolve && !viewer.admin ? "Author changed resolution" : text(command.reason, 3, 1000, "a moderation reason");
        if (operation === "hide") t.hidden = true;
        else if (operation === "restore") t.hidden = false;
        else if (operation === "lock") t.locked = true;
        else if (operation === "reopen") t.locked = false;
        else if (operation === "pin") t.pinned = true;
        else if (operation === "unpin") t.pinned = false;
        else if (resolve) t.resolved = operation === "resolve";
        else if (operation === "close-poll") { if (!t.poll) invalid("This post has no poll."); t.poll.closed = true; }
        else if (operation === "hide-comment" || operation === "restore-comment") {
          const c = data.comments.find((c) => c.id === command.commentId);
          if (!c) missing();
          c.hidden = operation === "hide-comment";
        } else if (operation === "dismiss-report") {
          const r = data.reports.find((r) => r.id === command.reportId);
          if (!r) missing();
          r.resolved = true;
        } else invalid("Choose a moderation action.");
        audit(`${operation}${command.commentId ? `:${command.commentId}` : command.reportId ? `:${command.reportId}` : ""}`, reason);
      }
      if (["edit", "review", "moderate"].includes(command.action)) { t.version++; t.updatedAt = now; }
    }
    retainForumActivity(data, now);
    data.requests[requestKey] = fingerprint;
    return detail(data, viewer, 1, now);
  });
}
