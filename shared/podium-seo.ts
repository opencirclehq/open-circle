import type { SeoDocument } from "./seo.js";

/** Pages that share the leaderboard podium card. */
export const PODIUM_PATHS: ReadonlySet<string> = new Set(["/", "/community"]);

/** The podium card. The server adds a version once it knows the standings; the browser uses the plain address. */
export function podiumImage(origin: string, version?: string, alt = "OpenCircle community leaderboard"): NonNullable<SeoDocument["image"]> {
  const query = version ? `?${new URLSearchParams({ v: version })}` : "";
  return { url: new URL(`/api/home-image${query}`, origin).href, alt, contentType: "image/png", width: 1200, height: 630 };
}
