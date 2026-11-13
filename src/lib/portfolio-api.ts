import type { PortfolioContent, PortfolioEditorState, PortfolioGitHubPage, PublicPortfolioPage } from "@shared/portfolio";
import { ApiError } from "./api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", ...init }); }
  catch { throw new ApiError(0, "network", "You look offline. Check your connection and try again."); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new ApiError(response.status, data?.error?.code ?? "portfolio_error", data?.error?.message ?? "Couldn't load your portfolio. Try again.", data?.error?.field);
  return data as T;
}

export const portfolioApi = {
  editor: (signal?: AbortSignal) => request<PortfolioEditorState>("/api/portfolio", { signal }),
  public: (slug: string, signal?: AbortSignal) => request<PublicPortfolioPage>(`/api/portfolio?slug=${encodeURIComponent(slug)}`, { signal }),
  save: (action: "save" | "publish" | "unpublish", content: PortfolioContent, version: number) => request<PortfolioEditorState>("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, content, version }) }),
  repositories: (page: number, signal?: AbortSignal) => request<PortfolioGitHubPage>(`/api/portfolio-github?page=${page}`, { signal }),
  profile: () => request<Pick<PortfolioContent, "displayName" | "bio" | "location">>("/api/portfolio-github?view=profile"),
  readme: (id: number) => request<{ readme: string }>(`/api/portfolio-github?readme=${id}`),
  upload: (file: File) => request<{ url: string }>("/api/portfolio-upload", { method: "POST", headers: { "content-type": file.type }, body: file }),
};
