import type { BlogArticle, BlogCommand, BlogDraft, BlogDraftPage, BlogPage, BlogQueue } from "@shared/blog";
import { request } from "./api";

export const blogApi = {
  list: (page: number, topic: string, signal?: AbortSignal) => request<BlogPage>(`/api/blog?${new URLSearchParams({ page: String(page), ...(topic ? { topic } : {}) })}`, { signal }),
  read: (slug: string, signal?: AbortSignal) => request<BlogArticle>(`/api/blog?${new URLSearchParams({ slug })}`, { signal }),
  mine: (signal?: AbortSignal) => request<{ items: BlogDraft[] }>("/api/blog?mine=1", { signal, cache: "no-store" }),
  draft: (id: string, signal?: AbortSignal) => request<BlogDraft>(`/api/blog?${new URLSearchParams({ id })}`, { signal, cache: "no-store" }),
  command: (input: BlogCommand, admin = false) => request<BlogDraft>(admin ? "/api/blog-admin" : "/api/blog", { method: "POST", headers: admin ? { "x-opencircle-admin": "1" } : {}, body: JSON.stringify(input) }),
  queue: (queue: BlogQueue, page: number, signal?: AbortSignal) => request<BlogDraftPage>(`/api/blog-admin?${new URLSearchParams({ queue, page: String(page) })}`, { signal, cache: "no-store" }),
  review: (id: string, signal?: AbortSignal) => request<BlogDraft>(`/api/blog-admin?${new URLSearchParams({ id })}`, { signal, cache: "no-store" }),
};
