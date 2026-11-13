import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEFAULT_SITE_URL } from "@shared/brand";
import { seoDocument, type SeoDocument } from "@shared/seo";
import { forumPreviewId, forumSeoDocument, type ForumSharePreview } from "@shared/forum-seo";
import { blogSlugFromPath } from "@shared/blog-paths";

/** The site's own origin. og:url always points here, unlike a cross-posted article's canonical link. */
export function currentOrigin() {
  const href = document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (href && URL.canParse(href)) return new URL(href).origin;
  return DEFAULT_SITE_URL;
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = Array.from(document.head.querySelectorAll(`meta[${attribute}]`)).find((meta) => meta.getAttribute(attribute) === key);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export function usePageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const origin = currentOrigin();
    const id = forumPreviewId(pathname);
    // Posts set their own tags once loaded, like events and community threads.
    const dynamic = !!id || /^\/events\/[a-z0-9-]+$/.test(pathname) || !!blogSlugFromPath(pathname);
    // og:url names this page even when a cross-posted article's canonical link points elsewhere.
    const shared = document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    if (!dynamic || !shared || !URL.canParse(shared) || new URL(shared).pathname !== pathname) applyPageMeta(seoDocument(pathname, origin));
    if (!id) return;
    const controller = new AbortController();
    void fetch(`/api/forum-preview?${new URLSearchParams({ id })}`, { signal: controller.signal, credentials: "omit", cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const preview = await response.json() as ForumSharePreview;
        if (!controller.signal.aborted) applyPageMeta(forumSeoDocument(preview, origin));
      }).catch(() => {});
    return () => controller.abort();
  }, [pathname]);
}

export function applyPageMeta(page: SeoDocument) {
  document.title = page.title;
  setMeta("name", "description", page.description);
  setMeta("name", "robots", page.robots);
  setMeta("property", "og:title", page.title);
  setMeta("property", "og:description", page.description);
  setMeta("property", "og:url", page.url);
  setMeta("name", "twitter:title", page.title);
  setMeta("name", "twitter:description", page.description);
  const image = page.image ?? { url: new URL("/og.png", page.url).href, alt: "OpenCircle: a white podium with a gold crown over first place, inside an open chrome ring.", contentType: "image/png", width: 1200, height: 630 };
  setMeta("property", "og:image", image.url);
  setMeta("property", "og:image:type", image.contentType);
  setMeta("property", "og:image:alt", image.alt);
  setMeta("name", "twitter:image", image.url);
  setMeta("name", "twitter:image:alt", image.alt);
  setMeta("property", "og:image:width", String(image.width ?? 1200));
  setMeta("property", "og:image:height", String(image.height ?? 630));
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", page.canonical ?? page.url);
}
