import { EVENT_BODY_BYTES } from "../shared/events.js";
import { FORUM_MAX_BYTES } from "../shared/forum.js";
import { BOT_SETTINGS_MAX_BYTES } from "../shared/bot-settings.js";
import { BLOG_MAX_BYTES } from "../shared/blog.js";
import { MAX_IMAGE_BYTES, MAX_PORTFOLIO_BYTES } from "../shared/portfolio.js";
import { getStore } from "./db.js";
import { handle, HttpError, MAX_REQUEST_BYTES, requireSameOrigin } from "./http.js";
import { clientKey } from "./rate-limit.js";

export function apiBodyLimit(pathname: string): number {
  const route = pathname.replace(/\/$/, "");
  return route === "/api/events" ? EVENT_BODY_BYTES : ["/api/forum", "/api/forum-admin"].includes(route) ? FORUM_MAX_BYTES : route === "/api/bot-settings" ? BOT_SETTINGS_MAX_BYTES : ["/api/blog", "/api/blog-admin"].includes(route) ? BLOG_MAX_BYTES : route === "/api/portfolio-upload" ? MAX_IMAGE_BYTES : route === "/api/portfolio" ? MAX_PORTFOLIO_BYTES : MAX_REQUEST_BYTES;
}

export function validateApiRequest(req: Request): void {
  if (req.url.length > 4096) throw new HttpError(414, "uri_too_long", "That request URL is too long.");
  const url = new URL(req.url);
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw new HttpError(400, "invalid_length", "That request length isn't valid.");
  if (length !== null && Number(length) > apiBodyLimit(url.pathname))
    throw new HttpError(413, "too_large", "That request is too large.");
  if (!["GET", "HEAD"].includes(req.method)) {
    requireSameOrigin(req);
    const type = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const upload = url.pathname.replace(/\/$/, "") === "/api/portfolio-upload";
    if (upload ? !["image/png", "image/jpeg", "image/webp"].includes(type ?? "") : type !== "application/json")
      throw new HttpError(415, "content_type", upload ? "Choose a PNG, JPEG or WebP image." : "Send this request as JSON.");
  }
}

export function apiHandler(req: Request, run: () => Promise<Response>): Promise<Response> {
  return handle(async () => {
    validateApiRequest(req);
    const store = getStore();
    const path = new URL(req.url).pathname.replace(/\/$/, "");
    const authentication = ["/api/auth-start", "/api/auth-callback"].includes(path);
    const reading = ["GET", "HEAD"].includes(req.method);
    const bucket = authentication ? "auth" : reading ? "read" : "write";
    if (!await store.rateLimit(`api:${bucket}:ip:${clientKey(req)}`, authentication ? 60 : 240, 60))
      throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.", undefined, { "retry-after": "60" });
    return run();
  });
}
