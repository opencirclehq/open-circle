import { createHash, randomUUID } from "node:crypto";
import {
  BLOG_DRAFT_LIMIT, BLOG_PAGE_SIZE, BLOG_PENDING_LIMIT, PORTFOLIO_POST_LIMIT, blogPostUrl, blogQueues, blogSlug, blogSlugPattern, blogTopics, readingMinutes, validateBlogContent,
  type BlogArticle, type BlogAuthor, type BlogContent, type BlogDraft, type BlogDraftPage, type BlogPage, type BlogPost, type BlogPublicAuthor, type BlogQueue,
  type BlogRepository, type BlogSummary, type BlogTopic, type PortfolioPost,
} from "../shared/blog.js";
import { blogMarkdownProblem } from "../shared/blog-markdown.js";
import { DEFAULT_SITE_URL } from "../shared/brand.js";
import type { ParticipationState } from "../shared/coordination.js";
import { publicPortfolio } from "../shared/portfolio.js";
import { authorize } from "./admin.js";
import { verifyRepository } from "./blog-repository.js";
import type { BlogStore } from "./blog-store.js";
import { getCommunityStore } from "./community-store.js";
import { getStore } from "./db.js";
import { githubProfile } from "./github-auth.js";
import { HttpError } from "./http.js";
import { coordinationRequest } from "./participation.js";
import { publicPortfolioUrl } from "./portfolio-html.js";
import { getPortfolioStore } from "./portfolio-store.js";
import { clientKey } from "./rate-limit.js";

export interface BlogViewer { profile: BlogAuthor; admin: boolean }
/** Public reads: the same for everyone, revalidated on every poll. */
export const BLOG_PUBLIC_HEADERS = { "cache-control": "no-cache", "vercel-cdn-cache-control": "max-age=30, stale-while-revalidate=120" };
export const BLOG_PRIVATE_HEADERS = { "cache-control": "private, no-store", vary: "Cookie" };
const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
function invalid(message: string, field?: string): never { throw new HttpError(400, "blog_invalid", message, field); }
function missing(): never { throw new HttpError(404, "blog_missing", "This post isn't available."); }
function conflict(): never { throw new HttpError(409, "blog_conflict", "This post changed. Reload it before saving again."); }
function reason(value: unknown, min: number, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > 1000) invalid(min ? `Write ${label} between ${min} and 1,000 characters.` : `Keep ${label} under 1,000 characters.`, "reason");
  return text;
}

async function limit(req: Request, id: number) {
  const store = getStore();
  const write = req.method !== "GET";
  const action = write ? "write" : "read";
  const allowed = await Promise.all([store.rateLimit(`blog:${action}:ip:${clientKey(req)}`, write ? 60 : 180, 60), store.rateLimit(`blog:${action}:account:${id}`, write ? 20 : 90, 60)]);
  if (allowed.some((value) => !value)) throw new HttpError(429, "blog_rate", "Wait a minute before trying again.", undefined, { "retry-after": "60" });
}

/** Writers are signed-in GitHub accounts linked to a current group member. */
export async function blogMember(req: Request): Promise<BlogViewer> {
  const profile = await githubProfile(req, getCommunityStore());
  if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to write for the blog.");
  await limit(req, profile.id);
  const state = await coordinationRequest<ParticipationState>("profile", { login: profile.login }).catch(() => { throw new HttpError(503, "blog_membership_unavailable", "We cannot check current group membership right now. Try again shortly."); });
  if (state.activity.tracking !== true) throw new HttpError(503, "blog_membership_unavailable", "Group membership checks are paused or out of date. Try again shortly.");
  if (state.activity.linked !== true || typeof state.activity.login !== "string" || state.activity.login.toLowerCase() !== profile.login.toLowerCase()) throw new HttpError(403, "blog_membership", "Verify your WhatsApp membership from Participation, then try again.");
  return { profile: { id: profile.id, login: profile.login, ...(profile.name ? { name: profile.name } : {}), avatarUrl: profile.avatarUrl }, admin: false };
}

export async function blogAdmin(req: Request): Promise<BlogViewer> {
  const profile = await authorize(req);
  return { profile: { id: profile.id, login: profile.login, ...(profile.name ? { name: profile.name } : {}), avatarUrl: profile.avatarUrl }, admin: true };
}

/** Authors link to their published portfolio, looked up on every read so taking it offline removes the link. */
async function publicAuthors(posts: BlogPost[]): Promise<Map<number, BlogPublicAuthor>> {
  const ids = [...new Set(posts.map((post) => post.author.id))];
  const portfolios = getPortfolioStore();
  return new Map(await Promise.all(ids.map(async (id) => {
    const record = await portfolios.readOwner(id);
    const author = posts.find((post) => post.author.id === id)!.author;
    return [id, { ...author, portfolioUrl: record && publicPortfolio(record) ? publicPortfolioUrl(record.published!.slug) : null }] as const;
  })));
}

function summary(post: BlogPost, author: BlogPublicAuthor): BlogSummary {
  const content = post.published!;
  return { slug: post.slug!, author, title: content.title, summary: content.summary, topic: content.topic, publishedAt: post.publishedAt!, editedAt: post.editedAt, featured: post.featured, readingMinutes: readingMinutes(content.body) };
}
export async function article(post: BlogPost): Promise<BlogArticle> {
  const author = (await publicAuthors([post])).get(post.author.id)!;
  return { ...summary(post, author), body: post.published!.body, canonicalUrl: post.published!.canonicalUrl, repository: post.published!.repository };
}
/** Private copy for the author or an admin; only admins see the audit trail. */
export function draft(post: BlogPost, withAudit: boolean): BlogDraft {
  const { audit, requests: _requests, ...rest } = post;
  return { ...rest, ...(withAudit ? { audit } : {}) };
}

function pageNumber(value: string | null): number {
  const number = Number(value ?? "1");
  if (!Number.isSafeInteger(number) || number < 1 || number > 10_000) invalid("Choose a valid page.");
  return number;
}

export async function listBlog(store: BlogStore, url: URL): Promise<BlogPage> {
  const number = pageNumber(url.searchParams.get("page"));
  const topic = url.searchParams.get("topic") ?? "";
  if (topic && !blogTopics.includes(topic as BlogTopic)) invalid("Choose a blog topic.");
  const data = await store.listPublished(number, topic);
  const last = Math.max(1, Math.ceil(data.total / BLOG_PAGE_SIZE));
  if (number > last && data.total) return listBlog(store, new URL(`?${new URLSearchParams({ page: String(last), ...(topic ? { topic } : {}) })}`, url));
  const authors = await publicAuthors(data.posts);
  return { items: data.posts.map((post) => summary(post, authors.get(post.author.id)!)), total: data.total, page: number, pageSize: BLOG_PAGE_SIZE };
}

export async function readBlog(store: BlogStore, slug: string): Promise<BlogArticle> {
  if (!blogSlugPattern.test(slug)) missing();
  const post = await store.readPublished(slug);
  if (!post) missing();
  return article(post);
}

/** An author's latest posts for their portfolio, linked back to the main site. */
export async function portfolioPosts(store: BlogStore, authorId: number, origin = process.env.SITE_URL || DEFAULT_SITE_URL): Promise<PortfolioPost[]> {
  return (await store.listAuthorPublished(authorId, PORTFOLIO_POST_LIMIT)).map((post) => ({ title: post.published!.title, summary: post.published!.summary, topic: post.published!.topic, publishedAt: post.publishedAt!, url: blogPostUrl(post.slug!, origin) }));
}

export async function myBlog(store: BlogStore, viewer: BlogViewer): Promise<{ items: BlogDraft[] }> {
  return { items: (await store.listAuthor(viewer.profile.id)).map((post) => draft(post, viewer.admin)) };
}

export async function readDraft(store: BlogStore, viewer: BlogViewer, id: string): Promise<BlogDraft> {
  if (!uuidPattern.test(id)) missing();
  return store.transact(id, false, ({ post }) => {
    if (!post || (!viewer.admin && post.author.id !== viewer.profile.id)) missing();
    return draft(post, viewer.admin);
  });
}

export async function queueBlog(store: BlogStore, url: URL): Promise<BlogDraftPage> {
  const queue = url.searchParams.get("queue") as BlogQueue | null;
  if (!queue || !blogQueues.includes(queue)) invalid("Choose a review queue.");
  const number = pageNumber(url.searchParams.get("page"));
  const data = await store.listQueue(queue, number);
  return { items: data.posts.map((post) => draft(post, false)), total: data.total, page: number, pageSize: BLOG_PAGE_SIZE };
}

async function uniqueSlug(store: Pick<BlogStore, "slugTaken">, title: string, id: string): Promise<string> {
  const base = blogSlug(title) ?? `post-${id.slice(0, 8)}`;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base.slice(0, 72)}-${attempt}`;
    if (!await store.slugTaken(slug, id)) return slug;
  }
  return `${base.slice(0, 66)}-${id.slice(0, 8)}`;
}

/** Reuses a repository already confirmed for this post; anything new is checked with its code host. */
async function confirmRepository(store: BlogStore, id: string, repository: BlogRepository | null): Promise<BlogRepository | null> {
  if (!repository) return null;
  const known = await store.transact(id, false, ({ post }) => [post?.revision?.repository, post?.published?.repository].find((saved) => saved?.url.toLowerCase() === repository.url.toLowerCase()) ?? null);
  return known ?? verifyRepository(repository);
}

/** Members save and submit their own posts; admins review and moderate. Every change bumps `version`. */
export async function commandBlog(store: BlogStore, viewer: BlogViewer, input: unknown, now = Date.now()): Promise<BlogDraft> {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : invalid("Send a valid blog request.");
  const action = String(body.action);
  const actions = viewer.admin ? ["review", "moderate"] : ["save", "submit"];
  if (!uuidPattern.test(String(body.requestId)) || !actions.includes(action)) invalid("Reload the page and try again.");
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) missing();
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) conflict();
  const id = body.id.toLowerCase();
  const version = Number(body.version);
  const requestKey = `${viewer.profile.id}:${body.requestId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  let content: BlogContent | null = null;
  if (action === "save" || action === "submit") {
    const checked = validateBlogContent(body.content, action === "submit");
    if (!checked.ok) invalid(checked.error, checked.field);
    const problem = action === "submit" ? blogMarkdownProblem(checked.value.body) : null;
    if (problem) invalid(problem, "body");
    // Network checks happen before the post is locked.
    content = { ...checked.value, repository: await confirmRepository(store, id, checked.repository) };
  }
  return store.transact(id, true, async (box) => {
    let post = box.post;
    if (post && !viewer.admin && post.author.id !== viewer.profile.id) missing();
    if (post?.requests[requestKey]) {
      if (post.requests[requestKey] !== fingerprint) throw new HttpError(409, "blog_retry", "That request was already used. Start a new action.");
      return draft(post, viewer.admin);
    }
    const audit = (entry: string, note = "") => post!.audit.push({ id: randomUUID(), actor: viewer.profile, action: entry, reason: note, at: now });
    if (content) {
      const others = (await box.listAuthor(viewer.profile.id)).filter((other) => other.id !== id);
      if (!post) {
        if (version !== 0) missing();
        if (others.filter((other) => !other.published).length >= BLOG_DRAFT_LIMIT) throw new HttpError(409, "blog_draft_limit", `You can keep up to ${BLOG_DRAFT_LIMIT} unpublished posts. Finish or wait on one before starting another.`);
        post = { id, slug: null, author: viewer.profile, version: 0, createdAt: now, updatedAt: now, published: null, publishedAt: null, editedAt: null, revision: null, review: "draft", reviewReason: "", submittedAt: null, hidden: false, featured: false, audit: [], requests: {} };
      } else if (version !== post.version) conflict();
      if (action === "submit" && others.filter((other) => other.review === "pending").length >= BLOG_PENDING_LIMIT) throw new HttpError(409, "blog_pending_limit", `You can have ${BLOG_PENDING_LIMIT} posts awaiting review at once. Wait for a decision before submitting another.`);
      post.author = viewer.profile;
      post.revision = content;
      if (action === "submit") { post.review = "pending"; post.submittedAt = now; post.reviewReason = ""; audit("submit"); }
      // Saving pulls a pending post back for editing; requested changes keep their reason on show.
      else if (post.review === "pending" || post.review === "approved") { if (post.review === "pending") audit("withdraw"); post.review = "draft"; }
    } else {
      if (!post) missing();
      if (version !== post.version) conflict();
      if (action === "review") {
        const decision = body.decision;
        if (post.review !== "pending" || !post.revision || !["approve", "changes", "reject"].includes(String(decision))) conflict();
        const note = reason(body.reason, decision === "approve" ? 0 : 5, decision === "approve" ? "a note" : "a reason for the author");
        audit(`review-${decision}`, note);
        if (decision === "approve") {
          post.slug ??= await uniqueSlug(box, post.revision.title, id);
          if (post.published) post.editedAt = now;
          post.published = post.revision;
          post.publishedAt ??= now;
          post.revision = null;
          post.review = "approved";
          post.reviewReason = "";
        } else {
          post.review = decision === "reject" ? "rejected" : "changes";
          post.reviewReason = note;
        }
      } else {
        const operation = String(body.operation);
        if (!["hide", "restore", "feature", "unfeature"].includes(operation)) invalid("Choose a moderation action.");
        if (operation.endsWith("feature") && !post.published) throw new HttpError(409, "blog_unpublished", "Only published posts can be featured.");
        audit(operation, reason(body.reason, operation === "hide" ? 3 : 0, operation === "hide" ? "a reason" : "a note"));
        if (operation === "hide" || operation === "restore") post.hidden = operation === "hide";
        else post.featured = operation === "feature";
      }
    }
    post.version++;
    post.updatedAt = now;
    post.requests = Object.fromEntries([...Object.entries(post.requests), [requestKey, fingerprint]].slice(-50));
    box.post = post;
    return draft(post, viewer.admin);
  }, content ? viewer.profile.id : undefined);
}
