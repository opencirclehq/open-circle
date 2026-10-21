import type { Plugin } from "vite";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { forumPreviewId } from "../shared/forum-seo";
import { blogSlugFromPath } from "../shared/blog-paths";
import { applySeo, llmsTxt, robotsTxt, seoDocument, siteOrigin, sitemapXml } from "../shared/seo";

/**
 * Link previews need absolute URLs, so index.html carries %SITE_URL%
 * placeholders filled from the public site origin. Each known route then gets
 * its own title, description, canonical and robots tags. The build also emits
 * robots.txt, sitemap.xml and llms.txt.
 */
export function seo(siteUrl: string | undefined): Plugin {
  const origin = siteOrigin(siteUrl || DEFAULT_SITE_URL);
  return {
    name: "opencircle:seo",
    transformIndexHtml: {
      order: "pre",
      async handler(html, ctx) {
        const ready = html.replaceAll("%SITE_URL%", origin);
        const pathname = new URL(ctx.originalUrl ?? "/", origin).pathname;
        const module = forumPreviewId(pathname) ? { path: "/server/forum-seo.ts", name: "communitySeoDocument" } : /^\/events\/[a-z0-9-]+$/.test(pathname) ? { path: "/server/event-seo.ts", name: "eventSeoDocument" } : blogSlugFromPath(pathname) ? { path: "/server/blog-seo.ts", name: "blogPageSeoDocument" } : null;
        const dynamic = ctx.server && module ? await ctx.server.ssrLoadModule(module.path) : null;
        const document = module && dynamic ? await dynamic[module.name](pathname, origin) : null;
        return applySeo(ready, document ?? seoDocument(pathname, origin));
      },
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0];
        const entries = pathname === "/sitemap.xml" ? await server.ssrLoadModule("/server/blog-seo.ts").then((blog) => blog.blogSitemapEntries()).catch(() => []) : [];
        const file = pathname === "/robots.txt" ? robotsTxt(origin) : pathname === "/sitemap.xml" ? sitemapXml(origin, undefined, entries) : pathname === "/llms.txt" ? llmsTxt(origin) : "";
        if (!file) return next();
        res.setHeader("content-type", pathname === "/sitemap.xml" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8");
        res.end(file);
      });
    },
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(origin) });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(origin, lastmod) });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llmsTxt(origin) });
    },
  };
}
