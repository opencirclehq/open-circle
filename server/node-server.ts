import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as events from "../api/events.js";
import * as eventRegistrations from "../api/event-registrations.js";
import * as eventUploads from "../api/event-uploads.js";
import * as eventMedia from "../api/event-media.js";
import * as eventCover from "../api/event-cover.js";
import * as botSettings from "../api/bot-settings.js";
/**
 * Standalone Node server for hosts that aren't Vercel (e.g. Pxxl): serves the
 * built SPA from dist/ and the same api/*.ts handlers on the same paths.
 * Background stats refresh just keeps running in this long-lived process.
 *
 *   pnpm build && pnpm build:server && pnpm start
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as admin from "../api/admin.js";
import * as analytics from "../api/analytics.js";
import * as adminSession from "../api/admin-session.js";
import * as auth from "../api/auth.js";
import * as authStart from "../api/auth-start.js";
import * as authCallback from "../api/auth-callback.js";
import * as forumLegacy from "../api/forum-legacy.js";
import * as forum from "../api/forum.js";
import * as forumAdmin from "../api/forum-admin.js";
import * as community from "../api/community.js";
import * as tools from "../api/tools.js";
import * as repositoryStars from "../api/repository-stars.js";
import * as vote from "../api/vote.js";
import * as board from "../api/board.js";
import * as preview from "../api/preview.js";
import * as register from "../api/register.js";
import * as participation from "../api/participation.js";
import * as progression from "../api/progression.js";
import { DEFAULT_SITE_URL } from "../shared/brand.js";
import { applySeo, originFromHtml, seoDocument } from "../shared/seo.js";
import * as portfolio from "../api/portfolio.js";
import * as portfolioGithub from "../api/portfolio-github.js";
import * as portfolioUpload from "../api/portfolio-upload.js";
import { apiBodyLimit, validateApiRequest } from "./api-security.js";
import { encodePublicJson } from "./http-encoding.js";
import { readBody } from "./vite-dev-api.js";
import { handle, HttpError, json } from "./http.js";
import { portfolioHtml, publicPortfolioSlug } from "./portfolio-html.js";
import { readPublicPortfolio } from "./portfolio.js";
import { eventSeoDocument } from "./event-seo.js";
import { communitySeoDocument } from "./forum-seo.js";
import * as forumPreview from "../api/forum-preview.js";
import * as forumImage from "../api/forum-image.js";

type Handler = (req: Request) => Promise<Response>;
const routes: Record<string, Record<string, Handler | undefined>> = {
  events: events as Record<string, Handler>,
  "event-registrations": eventRegistrations as Record<string, Handler>,
  "event-uploads": eventUploads as Record<string, Handler>,
  "event-media": eventMedia as Record<string, Handler>,
  "event-cover": eventCover as Record<string, Handler>,
  analytics: analytics as Record<string, Handler>,
  admin: admin as Record<string, Handler>,
  "bot-settings": botSettings as Record<string, Handler>,
  "admin-session": adminSession as Record<string, Handler>,
  auth: auth as Record<string, Handler>,
  "auth-start": authStart as Record<string, Handler>,
  "auth-callback": authCallback as Record<string, Handler>,
  "forum-legacy": forumLegacy as Record<string, Handler>,
  forum: forum as Record<string, Handler>,
  "forum-preview": forumPreview as Record<string, Handler>,
  "forum-image": forumImage as Record<string, Handler>,
  "forum-admin": forumAdmin as Record<string, Handler>,
  community: community as Record<string, Handler>,
  tools: tools as Record<string, Handler>,
  vote: vote as Record<string, Handler>,
  "repository-stars": repositoryStars as Record<string, Handler>,
  board: board as Record<string, Handler>,
  preview: preview as Record<string, Handler>,
  register: register as Record<string, Handler>,
  participation: participation as Record<string, Handler>,
  progression: progression as Record<string, Handler>,
  portfolio: portfolio as Record<string, Handler>,
  "portfolio-github": portfolioGithub as Record<string, Handler>,
  "portfolio-upload": portfolioUpload as Record<string, Handler>,
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

export function createAppServer(distDirectory = path.resolve(process.cwd(), "dist")) {
  const DIST = distDirectory;
  const INDEX = path.join(DIST, "index.html");
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (req, res) => {
    const callback = process.env.GITHUB_OAUTH_REDIRECT_URI ?? "";
    const callbackUrl = URL.canParse(callback) ? new URL(callback) : null;
    const configuredOrigin = callbackUrl && ["https:", "http:"].includes(callbackUrl.protocol) ? callbackUrl.origin : undefined;
    const requestBase = configuredOrigin ?? `http://${req.headers.host ?? "localhost"}`;
    if (!URL.canParse(req.url ?? "/", requestBase)) { res.writeHead(400).end(); return; }
    const url = new URL(req.url ?? "/", requestBase);
    res.setHeader("x-content-type-options", "nosniff");

    const api = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const route = api ? routes[api[1]] : undefined;
      const handler = route?.[req.method ?? "GET"];
      if (!handler) {
        const response = json({ error: { code: route ? "method_not_allowed" : "not_found", message: route ? "That method is not supported." : "That endpoint does not exist." } }, route ? 405 : 404, route ? { allow: Object.keys(route).filter((method) => /^(GET|HEAD|POST|PATCH|DELETE)$/.test(method)).join(", ") } : {});
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.writeHead(response.status).end(await response.text());
        return;
      }
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const forwarded = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",").at(-1)?.trim() : undefined;
        headers.set("x-vercel-forwarded-for", (process.env.TRUST_PROXY === "1" ? forwarded : undefined) ?? req.socket.remoteAddress ?? "unknown");
        const method = req.method ?? "GET";
        const response = await handle(async () => {
          validateApiRequest(new Request(url, { method, headers }));
          const maxBytes = apiBodyLimit(url.pathname);
          const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req, maxBytes);
          return handler(new Request(url, { method, headers, body: body ? new Uint8Array(body) : undefined }));
        });
        const streaming = url.pathname === "/api/event-media" && response.ok && response.body;
        const responseBody = streaming ? undefined : await encodePublicJson(response, req.headers["accept-encoding"] ?? "");
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          // Vercel-only CDN directive; meaningless here.
          if (key !== "vercel-cdn-cache-control" && key !== "set-cookie") res.setHeader(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader("set-cookie", cookies);
        if (response.status === 413) res.setHeader("connection", "close");
        if (streaming) { await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), res).catch(() => res.destroy()); } else res.end(responseBody);
      } catch (err) {
        console.error(err);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "internal", message: "Something broke on our side." } }));
      }
      return;
    }

    // Static files, falling back to index.html for client-side routes.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      const destination = url.pathname.replace(/^\/+/, "/").replace(/\/+$/, "") || "/";
      res.writeHead(301, { location: `${destination}${url.search}`, "cache-control": "no-cache" }).end();
      return;
    }
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    const file = path.join(DIST, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
    const target = file.startsWith(`${DIST}${path.sep}`) && existsSync(file) && statSync(file).isFile() ? file : INDEX;
    const ext = path.extname(target);
    res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
    if (target.includes(`${path.sep}assets${path.sep}`) || target.includes(`${path.sep}fonts${path.sep}`)) {
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
    } else if (target === INDEX) {
      res.setHeader("cache-control", "no-cache");
      const slug = publicPortfolioSlug(req.headers.host ?? "", url.pathname);
      if (slug) {
        res.setHeader("cache-control", "no-store");
        res.setHeader("referrer-policy", "no-referrer");
        res.setHeader("content-security-policy", "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'");
        try {
          const data = await readPublicPortfolio(slug);
          res.end(portfolioHtml(readFileSync(INDEX, "utf8"), data, slug));
        } catch (error) {
          res.statusCode = error instanceof HttpError && error.status === 404 ? 404 : 503;
          res.setHeader("x-robots-tag", "noindex, nofollow");
          res.end(portfolioHtml(readFileSync(INDEX, "utf8"), null, slug));
        }
        return;
      }
      if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/portfolio" || pathname === "/community" || pathname.startsWith("/community/")) {
        res.setHeader("x-robots-tag", "noindex, nofollow");
        res.setHeader("cache-control", "no-store");
        res.setHeader("x-frame-options", "DENY");
        res.setHeader("referrer-policy", "same-origin");
        res.setHeader("content-security-policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
      }
      if (!existsSync(INDEX)) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" }).end("The app is temporarily unavailable.");
        return;
      }
      const raw = readFileSync(INDEX, "utf8");
      const origin = originFromHtml(raw, process.env.SITE_URL || DEFAULT_SITE_URL);
      let document = seoDocument(pathname, origin);
      try { document = await communitySeoDocument(pathname, origin) ?? await eventSeoDocument(pathname, origin) ?? document; }
      catch (error) {
        console.error(error);
        document = { ...document, status: 503 };
      }
      if (pathname.startsWith("/events/")) res.setHeader("cache-control", "no-store");
      if (!document.index) res.setHeader("x-robots-tag", "noindex, nofollow");
      res.writeHead(document.status).end(applySeo(raw.replaceAll("%SITE_URL%", origin), document));
      return;
    }
    createReadStream(target).on("error", () => {
      if (!res.headersSent) res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("The app is temporarily unavailable.");
    }).pipe(res);
  });
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer().listen(port, () => console.log(`OpenCircle listening on :${port}`));
}
