import { pageName, SEO_PAGES } from "../shared/seo.js";
import { shareImageVersion } from "../shared/share-image.js";
import type { ShareCard } from "./forum-image.js";

/** The indexed pages that use the plain card; the home page draws its own. */
export function pageShareCard(path: string): { key: string; card: ShareCard } | null {
  const page = SEO_PAGES.find((entry) => entry.path === path && entry.index && entry.path !== "/");
  if (!page) return null;
  const title = pageName(page);
  return {
    key: `page:${page.path}:${shareImageVersion(title, page.description)}`,
    card: { label: "Open Source Circle", title, description: page.description, author: "", category: "" },
  };
}
