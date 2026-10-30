import { BOT_ADMIN_MAX_BYTES, type BotAdminAction, type BotAdminResource, type BotAdminResponses } from "../shared/bot-admin.js";
import type { CoordinationAdminState } from "../shared/coordination.js";
import { decodeBotAdmin } from "./bot-admin-contract.js";
import { HttpError } from "./http.js";

export async function botAdminRequest<K extends BotAdminResource>(resource: K, input?: BotAdminAction): Promise<BotAdminResponses[K]> {
  const unavailable = () => new HttpError(503, "bot_admin_unavailable", "WhatsApp management is unavailable. Check the bot connection and admin access, then try again.");
  const uncertain = () => new HttpError(503, "bot_admin_uncertain", "The change may have completed, but its result couldn't be confirmed. Refresh WhatsApp data and review the result before another attempt.");
  const token = process.env.WHATSAPP_ADMIN_TOKEN?.trim();
  if (!token || token.length < 32 || token === process.env.WHATSAPP_MEMBERSHIP_TOKEN?.trim()) throw unavailable();
  let endpoint: URL;
  try {
    endpoint = new URL(process.env.WHATSAPP_MEMBERSHIP_URL?.trim() ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith("/api/v1/membership") || endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && local && process.env.NODE_ENV !== "production")) throw unavailable();
    endpoint.pathname = endpoint.pathname.replace(/membership$/, `admin/${input ? "action" : resource}`);
  } catch { throw unavailable(); }
  let response: Response;
  let result: unknown;
  try {
    response = await fetch(endpoint, { method: input ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cache-control": "no-store" }, body: input ? JSON.stringify(input) : undefined, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.body) throw unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > BOT_ADMIN_MAX_BYTES) throw unavailable(); chunks.push(chunk.value); }
    } finally { await reader.cancel().catch(() => undefined); }
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw input ? uncertain() : unavailable(); }
  if (!response.ok) {
    if ([400, 404, 409, 429].includes(response.status) && result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error.length <= 1000) throw new HttpError(response.status, "bot_admin_rejected", result.error, undefined, response.status === 429 ? { "retry-after": "60" } : undefined);
    throw input && response.status >= 500 ? uncertain() : unavailable();
  }
  if (["status", "groups"].includes(resource) && !input) {
    if (!result || typeof result !== "object" || !("success" in result) || result.success !== true || !("data" in result)) throw unavailable();
    result = result.data;
  }
  try { return decodeBotAdmin(resource, result); } catch { throw input ? uncertain() : unavailable(); }
}

export const botAdminAction = (input: BotAdminAction): Promise<CoordinationAdminState> => botAdminRequest("state", input);
