import type { GitHubProfile } from "./community";
import type { CommunityActivity } from "./community-activity";

export const FORUM_MAX_BYTES = 48_000;
export const FORUM_PAGE_SIZE = 15;
export const forumCategories = ["General development", "Git / GitHub", "Portfolio feedback", "Frontend", "Backend", "Open-source contributions"] as const;
export type ForumCategory = typeof forumCategories[number];
export type ForumKind = "discussion" | "question";
export type ReviewStatus = "draft" | "pending" | "approved" | "rejected" | "changes";
export type ForumAuthor = Pick<GitHubProfile, "id" | "login" | "name" | "avatarUrl">;
export interface ForumContent { title: string; body: string; category: ForumCategory }
export interface ForumPoll { question: string; options: { id: string; label: string }[]; closesAt: number | null; closed: boolean }
export interface ForumThread {
  id: string; kind: ForumKind; author: ForumAuthor; createdAt: number; updatedAt: number; version: number;
  published: ForumContent | null; publishedAt: number | null; editedAt: number | null; revision: ForumContent | null;
  review: ReviewStatus; reviewReason: string; submittedAt: number; hidden: boolean; locked: boolean; pinned: boolean; resolved: boolean;
  poll: ForumPoll | null;
  likedBy?: number[];
  activity?: CommunityActivity[];
}
export interface ForumComment { id: string; parentId: string | null; author: ForumAuthor; body: string; createdAt: number; hidden: boolean; likedBy?: number[] }
export interface ForumCommentView extends Omit<ForumComment, "likedBy"> { likeCount: number; liked: boolean }
export interface ForumReport { id: string; commentId: string | null; author: ForumAuthor; reason: string; createdAt: number; resolved: boolean }
export interface ForumAudit { id: string; actor: ForumAuthor; action: string; reason: string; at: number; content?: ForumContent }
export interface ForumAggregate {
  thread: ForumThread | null; comments: ForumComment[]; votes: Record<string, string>; reports: ForumReport[]; audit: ForumAudit[];
  requests: Record<string, string>;
}
export interface ForumSummary {
  id: string; kind: ForumKind; author: ForumAuthor; content: ForumContent; createdAt: number; publishedAt: number | null; updatedAt: number;
  pinned: boolean; locked: boolean; resolved: boolean; hidden: boolean; version: number; edited: boolean; commentCount: number;
  review?: ReviewStatus; hasRevision?: boolean; likeCount: number; liked: boolean; hasPoll: boolean; publishedTitle: string | null;
}
export interface ForumPollView extends ForumPoll { ballot: string; total: number; counts: Record<string, number>; selected: string | null; open: boolean }
export interface ForumDetail extends ForumSummary {
  comments: ForumCommentView[]; commentTotal: number; commentPage: number; poll: ForumPollView | null;
  revision?: ForumContent | null; reviewReason?: string; submittedAt?: number; reports?: (ForumReport & { reportedComment?: ForumCommentView })[]; audit?: ForumAudit[];
}
export interface ForumPage { items: ForumSummary[]; total: number; page: number; pageSize: number }
export function forumAuthorName(author?: ForumAuthor) { return typeof author?.name === "string" && author.name.trim() ? author.name.trim() : author ? `@${author.login}` : "member"; }
export interface ForumFilter { kind: ForumKind; page: number; search: string; category: string; status: string; mine: boolean; queue: string }
export type ForumCommand = {
  action: "create" | "edit" | "comment" | "vote" | "like" | "report" | "review" | "moderate";
  requestId: string; id?: string; version?: number; kind?: ForumKind; content?: ForumContent; publish?: boolean;
  poll?: ForumPoll | null; body?: string; parentId?: string | null; optionId?: string; ballot?: string; commentId?: string | null; liked?: boolean;
  reason?: string; decision?: "approve" | "reject" | "changes"; operation?: "hide" | "restore" | "lock" | "reopen" | "pin" | "unpin" | "resolve" | "unresolve" | "close-poll" | "hide-comment" | "restore-comment" | "dismiss-report"; reportId?: string;
};
export function forumDestination(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !/^\/community(?:\/(?:[a-f\d-]{36}|help\/[A-Za-z\d_-]{1,80}))?(?:\?[^#]*)?$/.test(value)) return null;
  const url = new URL(value, "https://opencircle.invalid");
  for (const [key, entry] of url.searchParams) {
    if (key === "tab" && ["discussions", "questions"].includes(entry)) continue;
    if (key === "mine" && entry === "1") continue;
    if (key === "page" && /^[1-9]\d{0,4}$/.test(entry) && Number(entry) <= 10000) continue;
    if (key === "search" && entry.length <= 150) continue;
    if (key === "category" && forumCategories.includes(entry as ForumCategory)) continue;
    if (key === "status" && ["open", "resolved"].includes(entry)) continue;
    return null;
  }
  return `${url.pathname}${url.search}`;
}

export function reviewLabel(review?: string, revision = false) {
  if (review === "pending") return revision ? "Revision awaiting approval" : "Awaiting approval";
  if (review === "rejected") return "Rejected";
  if (review === "changes") return "Changes requested";
  if (review === "draft") return "Draft";
  return null;
}
