import type { GitHubProfile } from "./community.js";
import { DEFAULT_SITE_URL } from "./brand.js";
import { RESERVED_BLOG_SLUGS } from "./blog-paths.js";
import type { Parsed } from "./validation.js";

export const BLOG_MAX_BYTES = 200_000;
export const BLOG_PAGE_SIZE = 12;
/** Posts one member can have awaiting review at once. */
export const BLOG_PENDING_LIMIT = 3;
/** Unpublished posts one member can keep. */
export const BLOG_DRAFT_LIMIT = 20;
/** Most recent posts shown on an author's portfolio. */
export const PORTFOLIO_POST_LIMIT = 6;
export const BLOG_LIMITS = { title: { min: 8, max: 120 }, summary: { min: 30, max: 280 }, body: { min: 300, max: 40_000 } } as const;
export const blogTopics = ["Open source", "Tutorials", "Career", "Frontend", "Backend", "Community"] as const;
export type BlogTopic = typeof blogTopics[number];
export type BlogReview = "draft" | "pending" | "approved" | "changes" | "rejected";
export const blogQueues = ["pending", "published", "hidden", "drafts", "rejected", "all"] as const;
export type BlogQueue = typeof blogQueues[number];
export type BlogAuthor = Pick<GitHubProfile, "id" | "login" | "name" | "avatarUrl">;
/** Public pages also link the author's published portfolio, when there is one. */
export type BlogPublicAuthor = BlogAuthor & { portfolioUrl: string | null };
export const REPOSITORY_HOSTS = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" } as const;
export type RepositoryProvider = keyof typeof REPOSITORY_HOSTS;
export const REPOSITORY_LABELS: Record<RepositoryProvider, string> = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };
export interface BlogRepository { provider: RepositoryProvider; fullName: string; url: string }
/** `canonicalUrl` and `repository` are optional, but always sent: null means none. */
export interface BlogContent { title: string; summary: string; topic: BlogTopic; body: string; canonicalUrl: string | null; repository: BlogRepository | null }
/** What the editor sends: the repository is a URL the server still has to confirm. */
export type BlogContentInput = Omit<BlogContent, "repository"> & { repository: string | null };
export interface BlogAudit { id: string; actor: BlogAuthor; action: string; reason: string; at: number }
/** The stored document. `published` is the live copy; `revision` is the author's working copy. */
export interface BlogPost {
  id: string; slug: string | null; author: BlogAuthor; version: number; createdAt: number; updatedAt: number;
  published: BlogContent | null; publishedAt: number | null; editedAt: number | null;
  revision: BlogContent | null; review: BlogReview; reviewReason: string; submittedAt: number | null;
  hidden: boolean; featured: boolean; audit: BlogAudit[]; requests: Record<string, string>;
}
/** What anyone can read: only the approved, visible copy. */
export interface BlogSummary { slug: string; author: BlogPublicAuthor; title: string; summary: string; topic: BlogTopic; publishedAt: number; editedAt: number | null; featured: boolean; readingMinutes: number }
export interface BlogArticle extends BlogSummary { body: string; canonicalUrl: string | null; repository: BlogRepository | null }
export interface BlogPage { items: BlogSummary[]; total: number; page: number; pageSize: number }
/** A post as listed on its author's portfolio, which lives on another host. */
export interface PortfolioPost { title: string; summary: string; topic: BlogTopic; publishedAt: number; url: string }
/** What the author and admins see. */
export type BlogDraft = Omit<BlogPost, "audit" | "requests"> & { audit?: BlogAudit[] };
export interface BlogDraftPage { items: BlogDraft[]; total: number; page: number; pageSize: number }
interface BlogCommandBase { requestId: string; id: string; version: number }
export type BlogCommand =
  | BlogCommandBase & { action: "save" | "submit"; content: BlogContentInput }
  | BlogCommandBase & { action: "review"; decision: "approve" | "changes" | "reject"; reason?: string }
  | BlogCommandBase & { action: "moderate"; operation: "hide" | "restore" | "feature" | "unfeature"; reason?: string };

export { blogDestination, blogPostUrl, blogSlugFromPath, blogSlugPattern } from "./blog-paths.js";

/** A readable address from the title, or null when the title has too few Latin letters to make one. */
export function blogSlug(title: string): string | null {
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72).replace(/-+$/, "");
  return base.length >= 3 && !RESERVED_BLOG_SLUGS.has(base) ? base : null;
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
}

export function blogReviewLabel(review: BlogReview, live: boolean): string {
  if (review === "pending") return live ? "Revision awaiting approval" : "Awaiting approval";
  if (review === "changes") return "Changes requested";
  if (review === "rejected") return "Not accepted";
  if (review === "draft") return live ? "Unsubmitted changes" : "Draft";
  return "Published";
}

function webUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value || value.length > 2048 || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") ? url : null;
}

/** Where the post first appeared. Search engines credit that address instead of this site. */
export function parseCanonicalUrl(raw: string, siteHost = new URL(DEFAULT_SITE_URL).hostname): Parsed<string> {
  const url = webUrl(raw);
  if (!url) return { ok: false, error: "Enter the full https:// address where this post was first published." };
  if (url.hostname === siteHost || url.hostname === `www.${siteHost}`) return { ok: false, error: "Use the address of the original post, not an OpenCircle page." };
  url.hash = "";
  return { ok: true, value: url.href };
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_])?$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_RESERVED = new Set(["about", "apps", "codespaces", "collections", "contact", "customer-stories", "dashboard", "enterprise", "events", "explore", "features", "issues", "join", "login", "marketplace", "new", "notifications", "organizations", "orgs", "pricing", "pulls", "readme", "search", "security", "settings", "site", "sponsors", "team", "topics", "trending", "users"]);

/**
 * The address of a repository on GitHub, GitLab or Bitbucket, normalised to its
 * home page. This checks the shape only; the server confirms the repository exists.
 */
export function parseRepositoryUrl(raw: string): Parsed<BlogRepository> {
  const fail = { ok: false as const, error: "Enter a public repository address on github.com, gitlab.com or bitbucket.org, such as https://github.com/owner/project." };
  const url = webUrl(raw);
  if (!url) return fail;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const provider = (Object.keys(REPOSITORY_HOSTS) as RepositoryProvider[]).find((key) => REPOSITORY_HOSTS[key] === host);
  if (!provider) return fail;
  let segments = url.pathname.split("/").filter(Boolean);
  if (provider === "gitlab") { const end = segments.indexOf("-"); if (end >= 0) segments = segments.slice(0, end); }
  else segments = segments.slice(0, 2);
  if (segments.length && segments.at(-1)!.endsWith(".git")) segments[segments.length - 1] = segments.at(-1)!.slice(0, -4);
  const valid = segments.length >= 2 && (provider === "gitlab" ? segments.length <= 20 : segments.length === 2)
    && segments.slice(0, -1).every((part) => OWNER.test(part)) && NAME.test(segments.at(-1)!) && ![".", ".."].includes(segments.at(-1)!)
    && !(provider === "github" && GITHUB_RESERVED.has(segments[0].toLowerCase()));
  if (!valid) return fail;
  const fullName = segments.join("/");
  return { ok: true, value: { provider, fullName, url: `https://${REPOSITORY_HOSTS[provider]}/${fullName}` } };
}

export type BlogEmbed = { kind: "youtube"; id: string; start: number | null } | { kind: "gist"; user: string; id: string };

function seconds(value: string | null): number | null {
  if (!value) return null;
  const match = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s?)?$/.exec(value);
  if (!match || !match[0]) return null;
  const total = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return total > 0 && total < 86_400 ? total : null;
}

/** A YouTube video or GitHub Gist address on its own line becomes an embed. */
export function blogEmbed(raw: string): BlogEmbed | null {
  const url = webUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const video = /^[A-Za-z0-9_-]{11}$/;
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (id !== null) return video.test(id) ? { kind: "youtube", id, start: seconds(url.searchParams.get("t") ?? url.searchParams.get("start")) } : null;
  if (host === "gist.github.com") {
    const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([0-9a-f]{20,40}|\d{1,12})\/?$/.exec(url.pathname);
    return match ? { kind: "gist", user: match[1], id: match[2] } : null;
  }
  return null;
}

type Checked = { ok: true; value: BlogContentInput; repository: BlogRepository | null; error?: undefined; field?: undefined } | { ok: false; error: string; field: keyof BlogContentInput; value?: undefined; repository?: undefined };

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : null;
}

/**
 * Drafts may be unfinished, but nothing is filled in on the author's behalf: a
 * topic must be chosen, and the optional links must be sent as null when unused.
 */
export function validateBlogContent(input: unknown, complete: boolean): Checked {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  if (!blogTopics.includes(value.topic as BlogTopic)) return { ok: false, field: "topic", error: "Choose a topic for your post." };
  const fields = { title: "a title", summary: "a summary", body: "the post" } as const;
  const result = { topic: value.topic as BlogTopic } as BlogContentInput;
  for (const field of ["title", "summary", "body"] as const) {
    const text = clean(value[field]);
    const { min, max } = BLOG_LIMITS[field];
    if (text === null) return { ok: false, field, error: `Add ${fields[field]}.` };
    if ([...text].some((c) => { const code = c.charCodeAt(0); return code === 127 || (code < 32 && code !== 9 && code !== 10); })) return { ok: false, field, error: `Remove control characters from ${fields[field]}.` };
    if (text.length > max) return { ok: false, field, error: `Keep ${fields[field]} under ${max.toLocaleString("en")} characters.` };
    if (complete && text.length < min) return { ok: false, field, error: `Write at least ${min.toLocaleString("en")} characters for ${fields[field]}.` };
    result[field] = text;
  }
  if (!result.title) return { ok: false, field: "title", error: "Add a title." };
  if (!("canonicalUrl" in value) || (value.canonicalUrl !== null && typeof value.canonicalUrl !== "string")) return { ok: false, field: "canonicalUrl", error: "Say where the post was first published, or leave it empty." };
  if (value.canonicalUrl === null) result.canonicalUrl = null;
  else {
    const canonical = parseCanonicalUrl(value.canonicalUrl as string);
    if (!canonical.ok) return { ok: false, field: "canonicalUrl", error: canonical.error };
    result.canonicalUrl = canonical.value;
  }
  if (!("repository" in value) || (value.repository !== null && typeof value.repository !== "string")) return { ok: false, field: "repository", error: "Add the related repository, or leave it empty." };
  let repository: BlogRepository | null = null;
  if (value.repository !== null) {
    const parsed = parseRepositoryUrl(value.repository as string);
    if (!parsed.ok) return { ok: false, field: "repository", error: parsed.error };
    repository = parsed.value;
  }
  result.repository = repository?.url ?? null;
  return { ok: true, value: result, repository };
}
