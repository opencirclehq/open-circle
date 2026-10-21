import { DEFAULT_SITE_URL } from "../shared/brand.js";
import { portfolioHostname, portfolioSlugFromHostname, type PublicPortfolio } from "../shared/portfolio.js";

export function publicPortfolioSlug(hostname: string, pathname: string): string | null {
  const tenant = portfolioSlugFromHostname(hostname.split(":")[0]);
  if (tenant) return tenant;
  const path = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (!path) return null;
  try { return decodeURIComponent(path[1]).toLowerCase(); } catch { return null; }
}

/** A published portfolio's public address: its subdomain once those are live, otherwise /p/<slug>. */
export function publicPortfolioUrl(slug: string): string {
  const base = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return process.env.PORTFOLIO_SUBDOMAINS_ENABLED === "1" ? `https://${portfolioHostname(slug)}` : `${base}/p/${encodeURIComponent(slug)}`;
}

function escape(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!)); }

export function portfolioHtml(html: string, portfolio: PublicPortfolio | null, slug: string): string {
  const title = portfolio ? `${portfolio.displayName}${portfolio.headline ? ` · ${portfolio.headline}` : ""}` : "Portfolio unavailable · OpenCircle";
  const description = portfolio ? portfolio.bio || portfolio.headline || `${portfolio.displayName}'s work and projects.` : "This portfolio isn't published yet.";
  const url = publicPortfolioUrl(slug);
  const image = portfolio?.coverUrl || portfolio?.avatarUrl;
  const clean = html.replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|author|robots|theme-color|color-scheme|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
  const tags = [
    `<title>${escape(title)}</title>`, `<meta name="description" content="${escape(description)}" />`,
    `<meta name="robots" content="${portfolio ? "index, follow" : "noindex, nofollow"}" />`,
    `<meta name="theme-color" content="${portfolio?.theme === "light" ? "#f7f8fa" : "#080b10"}" />`,
    `<meta name="color-scheme" content="${portfolio?.theme === "light" ? "light" : "dark"}" />`,
    `<link rel="canonical" href="${escape(url)}" />`, `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${escape(title)}" />`, `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`, `<meta name="twitter:description" content="${escape(description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`, `<meta name="twitter:card" content="${portfolio?.coverUrl ? "summary_large_image" : "summary"}" />`,
  ];
  if (image) tags.push(`<meta property="og:image" content="${escape(image)}" />`, `<meta name="twitter:image" content="${escape(image)}" />`, `<meta property="og:image:alt" content="${escape(portfolio!.displayName)}" />`);
  if (portfolio) {
    const data = JSON.stringify({ "@context": "https://schema.org", "@type": "ProfilePage", url, mainEntity: { "@type": "Person", name: portfolio.displayName, description, image: portfolio.avatarUrl, sameAs: [`https://github.com/${portfolio.githubLogin}`] } }).replace(/</g, "\\u003c");
    tags.push(`<script type="application/ld+json">${data}</script>`);
  }
  return clean.replace(/<\/head>/i, () => `${tags.join("\n")}\n</head>`);
}
