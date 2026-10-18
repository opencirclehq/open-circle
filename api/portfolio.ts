import { apiHandler } from "../server/api-security.js";
import { requireSameOriginJson } from "../server/community.js";
import { json, readJson } from "../server/http.js";
import { MAX_PORTFOLIO_BYTES } from "../shared/portfolio.js";
import { getPortfolioStore } from "../server/portfolio-store.js";
import { PORTFOLIO_HEADERS, portfolioEditorState, portfolioRateLimit, readPublicPortfolio, requirePortfolioOrigin, requirePortfolioOwner, savePortfolio, syncPortfolioAchievement } from "../server/portfolio.js";
import { clientKey } from "../server/rate-limit.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const slug = new URL(req.url).searchParams.get("slug");
    if (slug !== null) {
      await portfolioRateLimit(req, clientKey(req), "read");
      return json(await readPublicPortfolio(slug.toLowerCase()), 200, { "cache-control": "no-store" });
    }
    const profile = await requirePortfolioOwner(req);
    const record = await getPortfolioStore().readOwner(profile.id);
    await syncPortfolioAchievement(profile.login, record);
    return json(portfolioEditorState(profile, record), 200, PORTFOLIO_HEADERS);
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requirePortfolioOrigin(req);
    requireSameOriginJson(req);
    const profile = await requirePortfolioOwner(req);
    await portfolioRateLimit(req, String(profile.id), "write");
    return json(await savePortfolio(profile, await readJson(req, MAX_PORTFOLIO_BYTES)), 200, PORTFOLIO_HEADERS);
  });
}
