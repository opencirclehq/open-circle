import { BRAND_NAME, DEFAULT_SITE_URL } from "./brand";
import { blogSlugFromPath } from "./blog-paths";

export const GITHUB_URL = "https://github.com/opencirclehq/open-circle";
export const X_URL = "https://x.com/_Cybersmith";

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  summary: string;
  heading: string;
  index: boolean;
};

const HOME_HEADING = "Paste your username. Take your place.";

export const SEO_PAGES: readonly SeoPage[] = [
  { path: "/events", title: `Events · ${BRAND_NAME}`, description: "Learning sessions and recordings for OpenCircle members.", summary: "Community events, recordings and resources.", heading: "Events", index: false },
  {
    path: "/",
    title: `${BRAND_NAME} · Community leaderboard for Open Source Circle`,
    description:
      "The Open Source Circle community leaderboard. Help other members with fixes, testing, documentation and answers, then earn points when your help is confirmed.",
    summary: "The community leaderboard for Open Source Circle.",
    heading: HOME_HEADING,
    index: true,
  },
  {
    path: "/repositories",
    title: `Spotlight · ${BRAND_NAME}`,
    description:
      "One spotlight repository per Open Source Circle developer, each with at least 5 GitHub stars. Find and support the circle's best public projects.",
    summary: "One repo per developer. At least 5 stars.",
    heading: HOME_HEADING,
    index: true,
  },
  {
    path: "/tools",
    title: `Developer tools · ${BRAND_NAME}`,
    description:
      "Developer tools shared by Open Source Circle. Browse the directory, see how members rate them, and submit a tool for review.",
    summary: "Tools shared and rated by the circle.",
    heading: HOME_HEADING,
    index: true,
  },
  {
    path: "/how-it-works",
    title: `How ranking works · ${BRAND_NAME}`,
    description:
      "How OpenCircle rewards confirmed useful help, different members supported and GitHub reputation, with limits to prevent repeated contributions farming points.",
    summary: "How confirmed help and GitHub reputation become a rank.",
    heading: HOME_HEADING,
    index: true,
  },
  {
    path: "/blog",
    title: `Blog · ${BRAND_NAME}`,
    description: "Articles from Open Source Circle developers on open source, tutorials, careers and building in public. Every post is reviewed before it's published.",
    summary: "Writing from the circle, reviewed before it's published.",
    heading: "Blog",
    index: true,
  },
  { path: "/blog/mine", title: `Your posts · ${BRAND_NAME}`, description: "Your OpenCircle blog drafts and submissions.", summary: "Your blog drafts and submissions.", heading: "Your posts", index: false },
  { path: "/blog/write", title: `Write a post · ${BRAND_NAME}`, description: "Write an OpenCircle blog post for review.", summary: "Write a blog post for review.", heading: "Write a post", index: false },
  {
    path: "/community",
    title: `Community · ${BRAND_NAME}`,
    description: "Development discussions, questions and polls for verified Open Source Circle members.",
    summary: "Discuss development and ask the circle for help.",
    heading: "Community",
    index: false,
  },
  {
    path: "/participation",
    title: `Group participation · ${BRAND_NAME}`,
    description:
      "Group participation for Open Source Circle. Sign in with GitHub to share projects, give feedback and answer help requests.",
    summary: "Sign in to share projects, give feedback and answer help requests.",
    heading: "Group participation",
    index: false,
  },
  {
    path: "/portfolio",
    title: `Your portfolio · ${BRAND_NAME}`,
    description: "Build and manage your OpenCircle portfolio from GitHub.",
    summary: "Build and manage your OpenCircle portfolio from GitHub.",
    heading: "Your portfolio",
    index: false,
  },
  {
    path: "/admin",
    title: `Admin · ${BRAND_NAME}`,
    description: "Organiser controls for OpenCircle.",
    summary: "Organiser controls for OpenCircle.",
    heading: "OpenCircle admin",
    index: false,
  },
];

const NOT_FOUND: SeoPage = {
  path: "",
  title: `Page not found · ${BRAND_NAME}`,
  description: "This OpenCircle address does not match a page.",
  summary: "Nothing ranks here.",
  heading: "404",
  index: false,
};

export const SITE_LINKS = [
  { path: "/", label: "Developer leaderboard" },
  { path: "/repositories", label: "Spotlight" },
  { path: "/tools", label: "Developer tools" },
  { path: "/how-it-works", label: "How ranking works" },
  { path: "/blog", label: "Blog" },
  { path: "/community", label: "Community" },
  { path: "/participation", label: "Group participation" },
] as const;

const byPath = new Map(SEO_PAGES.map((page) => [page.path, page]));

export type SeoDocument = SeoPage & {
  status: 200 | 404 | 503;
  robots: string;
  url: string;
  image?: { url: string; alt: string; contentType: string; width?: number; height?: number };
  /** Trusted, already-escaped article HTML for readers and crawlers without JavaScript. */
  content?: string;
  /** Where search engines should credit the page, when it isn't `url` (a cross-posted article). */
  canonical?: string;
};

export function siteOrigin(value = DEFAULT_SITE_URL) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!URL.canParse(trimmed)) return DEFAULT_SITE_URL;
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
  return url.origin;
}

export function pageFor(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";
  return byPath.get(path.startsWith("/community/") ? "/community" : path);
}

export function seoDocument(pathname: string, originInput = DEFAULT_SITE_URL): SeoDocument {
  const origin = siteOrigin(originInput);
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";
  const page = byPath.get(path.startsWith("/community/") ? "/community" : path)
    ?? (/^\/events\/[a-z0-9-]+$/.test(path) ? { ...byPath.get("/events")!, path }
      : /^\/blog\/write\/[a-f\d-]{36}$/i.test(path) ? { ...byPath.get("/blog/write")!, path }
        : blogSlugFromPath(path) ? { ...byPath.get("/blog")!, path } : NOT_FOUND);
  const canonicalPath = path.startsWith("/community/") ? path : page.path || (path.startsWith("/") ? path : "/");
  return {
    ...page,
    path: canonicalPath,
    status: page.path ? 200 : 404,
    robots: page.index ? "index, follow, max-image-preview:large" : "noindex, nofollow",
    url: canonicalPath === "/" ? `${origin}/` : `${origin}${canonicalPath}`,
  };
}

export function originFromHtml(html: string, fallback = DEFAULT_SITE_URL) {
  const match =
    html.match(/<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i) ??
    html.match(/<link\b(?=[^>]*\bhref=["']([^"']+)["'])(?=[^>]*\brel=["']canonical["'])[^>]*>/i);
  const href = match?.[1];
  if (!href || href.includes("%SITE_URL%")) return siteOrigin(fallback);
  try {
    return new URL(href).origin;
  } catch {
    return siteOrigin(fallback);
  }
}

export function structuredData(originInput = DEFAULT_SITE_URL) {
  const origin = siteOrigin(originInput);
  const home = byPath.get("/")!;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "Open Source Circle",
        alternateName: BRAND_NAME,
        url: `${origin}/`,
        logo: `${origin}/apple-touch-icon.png`,
        sameAs: [GITHUB_URL, X_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: BRAND_NAME,
        alternateName: "Open Source Circle",
        url: `${origin}/`,
        description: home.description,
        inLanguage: "en",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}

export function robotsTxt(originInput = DEFAULT_SITE_URL) {
  const origin = siteOrigin(originInput);
  return ["User-agent: *", "Allow: /", "Allow: /api/event-cover", "Allow: /api/forum-image", "Allow: /api/blog-image", "Disallow: /admin", "Disallow: /portfolio", "Disallow: /api/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
}

/** Static pages, plus dynamic entries (published posts) when the server knows them. */
export function sitemapXml(originInput = DEFAULT_SITE_URL, lastmod = new Date().toISOString().slice(0, 10), entries: { path: string; lastmod: string }[] = []) {
  const origin = siteOrigin(originInput);
  const urls = [...SEO_PAGES.filter((page) => page.index).map((page) => ({ path: page.path, lastmod })), ...entries]
    .map((page) => {
      const loc = page.path === "/" ? `${origin}/` : `${origin}${escapeText(page.path)}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${page.lastmod}</lastmod>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function llmsTxt(originInput = DEFAULT_SITE_URL) {
  const origin = siteOrigin(originInput);
  const pages = SEO_PAGES.filter((page) => page.index)
    .map((page) => {
      const loc = page.path === "/" ? `${origin}/` : `${origin}${page.path}`;
      const label = SITE_LINKS.find((link) => link.path === page.path)?.label ?? page.title;
      return `- [${label}](${loc}): ${page.summary}`;
    })
    .join("\n");
  return [
    `# ${BRAND_NAME}`,
    "",
    "> The community leaderboard for the Open Source Circle developer community.",
    "",
    "OpenCircle rewards community help without expiring earned credit, with all-time, 7-day and 30-day views: 20 points per confirmed contribution and 5 per different member helped. Starring another member's public, original repo earns 20 helper points, once per recipient. GitHub reputation and repo upvotes add at most 20 points in total. Spotlight includes the OpenCircle community repo and one public, original repository per developer with at least 5 stars. Developers can choose an eligible repo when joining, or use the automatic most-starred pick. Members also share developer tools.",
    "",
    "## Pages",
    "",
    pages,
    "",
    `Group participation at ${origin}/participation is for signed-in members. Admin pages are private.`,
    "",
    "## Source",
    "",
    `- [GitHub](${GITHUB_URL})`,
    "",
  ].join("\n");
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function setAttribute(tag: string, name: string, value: string) {
  const assignment = ` ${name}="${escapeAttr(value)}"`;
  const pattern = new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, () => assignment);
  return tag.replace(/\s*\/?>$/, (ending) => `${assignment}${ending}`);
}

function replaceMeta(html: string, attribute: "name" | "property", key: string, content: string) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${key}["'])[^>]*>`, "i");
  const tag = html.match(pattern)?.[0];
  if (!tag) return html;
  return html.replace(tag, () => setAttribute(tag, "content", content));
}

function replaceCanonical(html: string, href: string) {
  const pattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  const tag = html.match(pattern)?.[0];
  if (!tag) return html;
  return html.replace(tag, () => setAttribute(tag, "href", href));
}

export function applySeo(html: string, document: SeoDocument) {
  const json = JSON.stringify(structuredData(new URL(document.url).origin), null, 2).replace(/</g, "\\u003c");
  let next = html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, () => `<title>${escapeText(document.title)}</title>`)
    .replace(/(<h1\b[^>]*\bid=["']seo-title["'][^>]*>)[\s\S]*?(<\/h1>)/i, (_, start, end) => `${start}${escapeText(document.heading)}${end}`)
    .replace(/(<p\b[^>]*\bid=["']seo-summary["'][^>]*>)[\s\S]*?(<\/p>)/i, (_, start, end) => `${start}${escapeText(document.summary)}${end}`)
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i, `<script type="application/ld+json">\n${json}\n    </script>`);
  next = next.replace(/\s*<article\b[^>]*\bid=["']seo-article["'][^>]*>[\s\S]*?<\/article>/i, "");
  if (document.content) next = next.replace(/<p\b[^>]*\bid=["']seo-summary["'][^>]*>[\s\S]*?<\/p>/i, (summary) => `${summary}\n        <article id="seo-article">${document.content}</article>`);
  next = replaceMeta(next, "name", "description", document.description);
  next = replaceMeta(next, "name", "robots", document.robots);
  next = replaceMeta(next, "property", "og:title", document.title);
  next = replaceMeta(next, "property", "og:description", document.description);
  next = replaceMeta(next, "property", "og:url", document.url);
  next = replaceMeta(next, "name", "twitter:title", document.title);
  next = replaceMeta(next, "name", "twitter:description", document.description);
  if (document.image) {
    next = replaceMeta(next, "property", "og:image", document.image.url);
    next = replaceMeta(next, "property", "og:image:type", document.image.contentType);
    next = replaceMeta(next, "property", "og:image:alt", document.image.alt);
    next = replaceMeta(next, "name", "twitter:image", document.image.url);
    next = replaceMeta(next, "name", "twitter:image:alt", document.image.alt);
    for (const dimension of ["width", "height"] as const) {
      if (document.image[dimension]) next = replaceMeta(next, "property", `og:image:${dimension}`, String(document.image[dimension]));
      else next = next.replace(new RegExp(`<meta\\b(?=[^>]*\\bproperty=["']og:image:${dimension}["'])[^>]*>\\s*`, "gi"), "");
    }
  }
  return replaceCanonical(next, document.canonical ?? document.url);
}
