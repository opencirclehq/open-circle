import { BOT_OPTION_FIELDS, BOT_SETTINGS_MAX_BYTES, MESSAGE_TEMPLATES, type BotSettingsInput, type BotSettingsState } from "../shared/bot-settings.js";
import { HttpError } from "./http.js";

function validState(input: unknown): input is BotSettingsState {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as BotSettingsState;
  if (!Number.isSafeInteger(value.version) || value.version < 0 || !value.policy || !value.community || !value.options || !value.messages || !value.status) return false;
  if (typeof value.policy.enabled !== "boolean" || typeof value.policy.timezone !== "string" || !Array.isArray(value.policy.welcomeTimes) || value.policy.welcomeTimes.length !== 3 || !value.policy.welcomeTimes.every((time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return false;
  const policy = value.policy;
  if (![policy.quietStart, policy.quietEnd].every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23) || ![policy.quietStartMinute ?? 0, policy.quietEndMinute ?? 0].every((minute) => Number.isInteger(minute) && minute >= 0 && minute <= 59)) return false;
  if (![policy.graceDays, policy.target, policy.reviewPeers, policy.periodDays, policy.reminderDays, policy.warningDays, policy.removalDays].every((number) => Number.isSafeInteger(number) && number > 0)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: policy.timezone }); } catch { return false; }
  if (![value.community.groupSchedule, value.community.summariesEnabled, value.community.mentorMatching, value.community.sessionsEnabled].every((flag) => typeof flag === "boolean") || typeof value.community.announcementsJid !== "string") return false;
  if (![value.community.summaryTime, value.community.helpTime, value.community.demoTime].every((time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || ![value.community.mentorWaitHours, value.community.helpDay, value.community.demoDay, value.community.sessionMinutes].every(Number.isInteger)) return false;
  for (const [key, field] of Object.entries(BOT_OPTION_FIELDS)) {
    const option = value.options[key as keyof typeof BOT_OPTION_FIELDS];
    if (key === "weeklyEngagementEnforcement" && option === undefined) continue;
    if (typeof field.value === "boolean" ? typeof option !== "boolean" : typeof option !== "number" || !Number.isInteger(option) || option < field.min || option > field.max) return false;
  }
  if (!Object.keys(MESSAGE_TEMPLATES).every((key) => typeof value.messages[key as keyof typeof MESSAGE_TEMPLATES] === "string" && value.messages[key as keyof typeof MESSAGE_TEMPLATES].length <= 6000)) return false;
  const status = value.status;
  if (status.lastDeliveryError !== undefined && status.lastDeliveryError !== null && (typeof status.lastDeliveryError !== "string" || status.lastDeliveryError.length > 1000)) return false;
  return [status.connected, status.botAdmin, status.tracking, status.announced].every((flag) => typeof flag === "boolean") && (status.groupOpen === null || typeof status.groupOpen === "boolean") && (status.lastCheckAt === null || Number.isSafeInteger(status.lastCheckAt)) && [status.pendingWelcomes, status.uncertainDeliveries].every((count) => Number.isSafeInteger(count) && count >= 0);
}

export async function botSettingsRequest(input?: BotSettingsInput): Promise<BotSettingsState> {
  const configured = process.env.WHATSAPP_MEMBERSHIP_URL?.trim();
  const token = process.env.WHATSAPP_ADMIN_TOKEN?.trim();
  const unavailable = () => new HttpError(503, "bot_settings_unavailable", "Bot settings are unavailable. Check the bot connection and its separate admin access, then try again.");
  if (!configured || !token || token.length < 32 || token === process.env.WHATSAPP_MEMBERSHIP_TOKEN?.trim()) throw unavailable();
  let endpoint: URL;
  try {
    endpoint = new URL(configured);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith("/api/v1/membership") || endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && local && process.env.NODE_ENV !== "production")) throw unavailable();
    endpoint.pathname = endpoint.pathname.replace(/membership$/, "settings");
  } catch { throw unavailable(); }
  const body = input === undefined ? undefined : JSON.stringify(input);
  if (body && Buffer.byteLength(body) > BOT_SETTINGS_MAX_BYTES) throw new HttpError(413, "too_large", "These bot settings are too large.");
  let response: Response;
  let result: unknown;
  try {
    response = await fetch(endpoint, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cache-control": "no-store" }, body, redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.body) throw unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > BOT_SETTINGS_MAX_BYTES + 8192) throw unavailable(); chunks.push(chunk.value); } } finally { await reader.cancel().catch(() => undefined); }
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw unavailable(); }
  if (!response.ok) {
    if ([400, 409, 429].includes(response.status) && result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error.length <= 1000) throw new HttpError(response.status, "bot_settings_rejected", result.error);
    throw unavailable();
  }
  if (!validState(result)) throw unavailable();
  const pick = <T extends object>(value: T, keys: readonly string[]): T => Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key as keyof T]])) as T;
  return {
    version: result.version,
    policy: pick(result.policy, ["enabled", "timezone", "welcomeTimes", "quietStart", "quietEnd", "quietStartMinute", "quietEndMinute", "graceDays", "target", "reviewPeers", "periodDays", "reminderDays", "warningDays", "removalDays"]),
    community: pick(result.community, ["groupSchedule", "summariesEnabled", "mentorMatching", "sessionsEnabled", "summaryTime", "announcementsJid", "mentorWaitHours", "helpDay", "helpTime", "demoDay", "demoTime", "sessionMinutes", "repositoriesEnabled", "pinRepositories", "weeklyBoardEnabled"]),
    options: pick(result.options, Object.keys(BOT_OPTION_FIELDS)), messages: pick(result.messages, Object.keys(MESSAGE_TEMPLATES)),
    status: { ...pick(result.status, ["connected", "botAdmin", "groupOpen", "tracking", "announced", "lastCheckAt", "pendingWelcomes", "uncertainDeliveries", "lastDeliveryError"]), consoleUrl: endpoint.origin },
  };
}
