import { DEFAULT_SITE_URL } from "./brand.js";

/**
 * Blog addresses, kept apart from the rest of the blog module because every
 * page loads them (page titles, analytics) while the rest loads with the blog.
 */
export const RESERVED_BLOG_SLUGS = new Set(["mine", "write", "new", "edit", "drafts", "feed", "rss", "admin"]);
export const blogSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export function blogSlugFromPath(pathname: string): string | null {
  const slug = /^\/blog\/([a-z0-9-]+)$/.exec(pathname)?.[1];
  return slug && blogSlugPattern.test(slug) && !RESERVED_BLOG_SLUGS.has(slug) ? slug : null;
}

export function blogPostUrl(slug: string, origin = DEFAULT_SITE_URL): string {
  return new URL(`/blog/${slug}`, origin).href;
}

/** Sign-in return paths that belong to the blog. */
export function blogDestination(value: unknown): string | null {
  return typeof value === "string" && /^\/blog(?:\/mine|\/write(?:\/[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})?)?$/i.test(value) ? value : null;
}
