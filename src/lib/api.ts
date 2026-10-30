import type { BotSettingsInput, BotSettingsState } from "@shared/bot-settings";
import type {
  AdminAction,
  AdminState,
  AdminSession,
  ApiErrorBody,
  Board,
  Preview,
  RegisterInput,
  RegisterResult,
} from "@shared/types";
import type { CommunityState, CommunityTool, ToolInput, ToolVoteInput, ToolVoteResult, VoteInput, VoteResult } from "@shared/community";
import type { LinkChallenge, ParticipationAction, ParticipationState } from "@shared/coordination";
import type { AdminAnalytics, AnalyticsDays } from "@shared/analytics";
import type { BotAdminAction, BotAdminResource, BotAdminResponses } from "@shared/bot-admin";
import type { CoordinationAdminState } from "@shared/coordination";

import type { RepositoryStar, RepositoryStarInput, RepositoryStars } from "@shared/repository-stars";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly retryAt?: number,
  ) {
    super(message);
  }
}

const readCooldowns = new Map<string, ApiError>();

export function retryAt(headers: Headers, status: number, now = Date.now()): number | undefined {
  const value = headers.get("retry-after")?.trim();
  if (value && /^\d+$/.test(value)) return now + Math.min(Number(value), 86_400) * 1000;
  if (value && /^[A-Za-z]{3}, /.test(value)) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(now, Math.min(date, now + 86_400_000));
  }
  return status === 429 ? now + 60_000 : undefined;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  init?.signal?.throwIfAborted();
  const reading = !init?.method || init.method === "GET";
  const cooldown = reading ? readCooldowns.get(path) : undefined;
  if (cooldown?.retryAt && cooldown.retryAt > Date.now()) throw cooldown;
  if (reading) readCooldowns.delete(path);
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: Object.fromEntries(headers),
    });
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new ApiError(0, "network", "You look offline. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  init?.signal?.throwIfAborted();
  if (!res.ok || !body) {
    const error = body?.error;
    const failure = new ApiError(res.status, error?.code ?? "unknown", error?.message ?? "Something went wrong. Try again.", error?.field, retryAt(res.headers, res.status));
    if (reading && res.status === 429) readCooldowns.set(path, failure);
    throw failure;
  }
  return body;
}

export const api = {
  botAdmin: <K extends BotAdminResource>(resource: K, signal?: AbortSignal) => request<BotAdminResponses[K]>(`/api/bot-admin?resource=${resource}`, { signal, cache: "no-store" }),
  botAdminAction: (input: BotAdminAction) => request<CoordinationAdminState>("/api/bot-admin", { method: "POST", headers: { "x-opencircle-admin": "1" }, body: JSON.stringify(input) }),
  botSettings: (signal?: AbortSignal) => request<BotSettingsState>("/api/bot-settings", { signal, cache: "no-store" }),
  saveBotSettings: (input: BotSettingsInput) => request<BotSettingsState>("/api/bot-settings", { method: "POST", headers: { "x-opencircle-admin": "1" }, body: JSON.stringify(input) }),
  repositoryStars: (ids: string[], signal?: AbortSignal) => request<RepositoryStars>(`/api/repository-stars?${new URLSearchParams(ids.map((id) => ["id", id]))}`, { signal, cache: "no-store" }),
  repositoryStar: (input: RepositoryStarInput) => request<RepositoryStar>("/api/repository-stars", { method: "POST", body: JSON.stringify(input) }),
  adminAnalytics: (days: AnalyticsDays, signal?: AbortSignal) => request<AdminAnalytics>(`/api/analytics?days=${days}`, { signal, cache: "no-store" }),
  participation: (signal?: AbortSignal) => request<ParticipationState>("/api/participation", { signal }),
  linkWhatsapp: (phone: string) => request<LinkChallenge>("/api/participation", { method: "POST", body: JSON.stringify({ action: "link", phone }) }),
  participate: (input: ParticipationAction) => request<ParticipationState>("/api/participation", { method: "POST", body: JSON.stringify(input) }),
  board: (signal?: AbortSignal) => request<Board>("/api/board", { signal }),
  community: (signal?: AbortSignal) => request<CommunityState>("/api/community", { signal }),
  vote: (input: VoteInput) => request<VoteResult>("/api/vote", { method: "POST", body: JSON.stringify(input) }),
  toolVote: (input: ToolVoteInput) => request<ToolVoteResult>("/api/vote", { method: "POST", body: JSON.stringify(input) }),
  signOut: () => request<{ ok: boolean }>("/api/auth", { method: "POST", body: "{}" }),
  submitTool: (input: ToolInput) => request<CommunityTool>("/api/tools", { method: "POST", body: JSON.stringify(input) }),
  adminSession: (signal?: AbortSignal) => request<AdminSession>("/api/admin-session", { signal, cache: "no-store" }),
  adminSignOut: () => request<{ ok: boolean }>("/api/admin-session", { method: "DELETE", headers: { "x-opencircle-admin": "1" }, body: "{}" }),
  adminTools: (signal?: AbortSignal) => request<CommunityTool[]>("/api/tools", { signal, cache: "no-store" }),
  addTool: (input: ToolInput) => request<CommunityTool>("/api/tools", {
    method: "PATCH",
    headers: { "x-opencircle-admin": "1" },
    body: JSON.stringify({ ...input, action: "create" }),
  }),
  approveTool: (id: string) => request<{ ok: boolean }>("/api/tools", {
    method: "PATCH",
    headers: { "x-opencircle-admin": "1" },
    body: JSON.stringify({ id, action: "approve" }),
  }),
  removeTool: (id: string) => request<{ ok: boolean }>("/api/tools", {
    method: "DELETE",
    headers: { "x-opencircle-admin": "1" },
    body: JSON.stringify({ id }),
  }),
  preview: (input: RegisterInput) => request<Preview>("/api/preview", { method: "POST", body: JSON.stringify(input) }),
  register: (input: RegisterInput) =>
    request<RegisterResult>("/api/register", { method: "POST", body: JSON.stringify(input) }),
  adminState: (signal?: AbortSignal) =>
    request<AdminState>("/api/admin", { signal, cache: "no-store" }),
  adminAction: (action: AdminAction) =>
    request<AdminState>("/api/admin", {
      method: "POST",
      headers: { "x-opencircle-admin": "1" },
      body: JSON.stringify(action),
    }),
};
