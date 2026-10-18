import type { GitHubProfile } from "../shared/community.js";
import { defaultPortfolio, publicPortfolio, type PortfolioEditorState, type PortfolioRecord } from "../shared/portfolio.js";
import { parsePortfolio, PortfolioValidationError } from "../shared/portfolio-validation.js";
import { awardPortfolioAchievement } from "./board.js";
import { getCommunityStore } from "./community-store.js";
import { getStore } from "./db.js";
import { githubProfile } from "./github-auth.js";
import { verifyPortfolioRepository } from "./portfolio-github.js";
import { getPortfolioStore } from "./portfolio-store.js";
import { portfolioUploadsAvailable } from "./portfolio-upload.js";
import { HttpError } from "./http.js";
import { clientKey } from "./rate-limit.js";

export const PORTFOLIO_HEADERS = { "cache-control": "private, no-store", vary: "Cookie" };

export async function requirePortfolioOwner(req: Request): Promise<GitHubProfile> {
  const profile = await githubProfile(req, getCommunityStore());
  if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to edit your portfolio.");
  return profile;
}

export function requirePortfolioOrigin(req: Request): void {
  const configured = process.env.GITHUB_OAUTH_REDIRECT_URI;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(req.url).origin) || site === "cross-site" || site === "same-site") throw new HttpError(403, "cross_origin", "Open your portfolio editor directly to make changes.");
  if (!configured || !URL.canParse(configured) || new URL(req.url).origin !== new URL(configured).origin) throw new HttpError(403, "portfolio_origin", "Open the main OpenCircle site to edit your portfolio.");
}

export async function portfolioRateLimit(req: Request, actor: string, action: "write" | "github" | "upload" | "read"): Promise<void> {
  const store = getStore();
  const limit = action === "upload" ? 20 : action === "read" ? 120 : action === "github" ? 60 : 30;
  const window = action === "upload" ? 3600 : 60;
  const results = await Promise.all([
    store.rateLimit(`portfolio:${action}:ip:${clientKey(req)}`, limit * 2, window),
    store.rateLimit(`portfolio:${action}:actor:${actor}`, limit, window),
  ]);
  if (results.some((allowed) => !allowed)) throw new HttpError(429, "portfolio_rate", "You've made several requests. Wait a little and try again.", undefined, { "retry-after": String(window) });
}

export function portfolioEditorState(profile: GitHubProfile, record: PortfolioRecord | null): PortfolioEditorState {
  return {
    profile, draft: record?.draft ?? defaultPortfolio(profile), version: record?.version ?? 0,
    publishedAt: record?.publishedAt ?? null, updatedAt: record?.updatedAt ?? null,
    uploadsAvailable: portfolioUploadsAvailable(), subdomainsAvailable: process.env.PORTFOLIO_SUBDOMAINS_ENABLED === "1",
  };
}

/**
 * Records the portfolio achievement once a portfolio is published. A storage
 * hiccup must not fail a publish that already landed, so the error is swallowed
 * and retried the next time the owner's state is read.
 */
export async function syncPortfolioAchievement(login: string, record: PortfolioRecord | null): Promise<void> {
  if (!record?.publishedAt) return;
  try {
    await awardPortfolioAchievement(getStore(), login);
  } catch (error) {
    console.error("Portfolio achievement award failed", error);
  }
}

export async function savePortfolio(profile: GitHubProfile, input: unknown): Promise<PortfolioEditorState> {
  const body = input as { action?: unknown; content?: unknown; version?: unknown } | null;
  if (!body || !["save", "publish", "unpublish"].includes(String(body.action)) || !Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new HttpError(400, "portfolio_action", "Choose whether to save, publish or unpublish your portfolio.");
  const store = getPortfolioStore();
  const saved = await store.readOwner(profile.id);
  if ((saved?.version ?? 0) !== body.version) throw new HttpError(409, "portfolio_conflict", "This portfolio changed in another tab. Reload before saving again.");
  try {
    const content = body.action === "unpublish" && saved ? saved.draft : parsePortfolio(body.content, saved?.draft.slug);
    if (body.action === "publish") {
      for (let index = 0; index < content.projects.length; index += 2) {
        await Promise.all(content.projects.slice(index, index + 2).map(async (project) => {
          project.repository = await verifyPortfolioRepository(project.repository.id, profile.id);
        }));
      }
    }
    const record = await store.write(profile.id, profile.login, content, Number(body.version), body.action as "save" | "publish" | "unpublish");
    if (body.action === "publish") await syncPortfolioAchievement(profile.login, record);
    return portfolioEditorState(profile, record);
  } catch (error) {
    if (error instanceof PortfolioValidationError) throw new HttpError(400, "portfolio_invalid", error.message, error.field);
    throw error;
  }
}

export async function readPublicPortfolio(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(slug)) throw new HttpError(404, "portfolio_missing", "This portfolio isn't published yet.");
  const record = await getPortfolioStore().readSlug(slug);
  const published = record && publicPortfolio(record);
  if (!published) throw new HttpError(404, "portfolio_missing", "This portfolio isn't published yet.");
  return published;
}
