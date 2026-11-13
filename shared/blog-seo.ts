import { BRAND_NAME, DEFAULT_SITE_URL } from "./brand.js";
import type { BlogArticle, BlogSummary } from "./blog.js";
import { seoDocument, type SeoDocument } from "./seo.js";

/** The share card changes whenever an approved edit goes live. */
export function blogImageVersion(post: Pick<BlogSummary, "publishedAt" | "editedAt">): string {
  return String(post.editedAt ?? post.publishedAt);
}

/** A cross-posted article names its original address as canonical; this page stays its share URL. */
export function blogSeoDocument(post: Pick<BlogArticle, "slug" | "title" | "summary" | "publishedAt" | "editedAt" | "canonicalUrl">, origin = DEFAULT_SITE_URL): SeoDocument {
  const path = `/blog/${post.slug}`;
  const document = seoDocument(path, origin);
  return {
    ...document, path, url: new URL(path, document.url).href,
    ...(post.canonicalUrl ? { canonical: post.canonicalUrl } : {}),
    title: `${post.title} · ${BRAND_NAME}`, heading: post.title,
    description: post.summary, summary: post.summary,
    image: {
      url: new URL(`/api/blog-image?${new URLSearchParams({ slug: post.slug, v: blogImageVersion(post) })}`, document.url).href,
      alt: `Blog post: ${post.title}`, contentType: "image/png", width: 1200, height: 630,
    },
  };
}
