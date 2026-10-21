import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { blogSlugFromPath, blogSlugPattern } from "../shared/blog.js";
import { blogMarkdownOptions } from "../shared/blog-markdown.js";
import { blogImageVersion, blogSeoDocument } from "../shared/blog-seo.js";
import { seoDocument, type SeoDocument } from "../shared/seo.js";
import { article } from "./blog.js";
import { getBlogStore } from "./blog-store.js";
import type { ShareCard } from "./forum-image.js";

/**
 * The same safe rendering as the page, for readers and crawlers without
 * JavaScript. Embeds stay as plain links here.
 */
export function blogHtml(body: string): string {
  return renderToStaticMarkup(h(Markdown, blogMarkdownOptions(h), body));
}

export async function blogPageSeoDocument(pathname: string, origin: string): Promise<SeoDocument | null> {
  const slug = blogSlugFromPath(pathname);
  if (!slug) return null;
  const post = await getBlogStore().readPublished(slug);
  if (!post) return {
    ...seoDocument(pathname, origin), status: 404, index: false, robots: "noindex, nofollow", title: "Post unavailable · OpenCircle",
    heading: "Post unavailable", description: "This blog post is unavailable.", summary: "This blog post is unavailable.",
  };
  const view = await article(post);
  return { ...blogSeoDocument(view, origin), content: blogHtml(view.body) };
}

export async function blogSitemapEntries(): Promise<{ path: string; lastmod: string }[]> {
  return (await getBlogStore().publishedPaths()).map((post) => ({ path: `/blog/${post.slug}`, lastmod: new Date(post.modifiedAt).toISOString().slice(0, 10) }));
}

export async function blogShareCard(slug: string): Promise<{ key: string; card: ShareCard } | null> {
  if (!blogSlugPattern.test(slug)) return null;
  const post = await getBlogStore().readPublished(slug);
  if (!post) return null;
  const content = post.published!;
  const version = blogImageVersion({ publishedAt: post.publishedAt!, editedAt: post.editedAt });
  return { key: `blog:${post.slug}:${version}`, card: { label: "Blog", title: content.title, description: content.summary, author: `@${post.author.login}`, category: content.topic } };
}
