import type { CoordinationAdminState } from "./coordination.js";

export const BOT_ADMIN_MAX_BYTES = 6 * 1024 * 1024;
export const BOT_ADMIN_RESOURCES = ["state", "status", "groups", "joins"] as const;
export type BotAdminResource = typeof BOT_ADMIN_RESOURCES[number];
export interface BotConnection {
  state: string;
  account: { name: string | null; phone: string | null } | null;
  qrImage: string | null;
  groupJid: string | null;
}
export interface BotAdminResponses {
  state: CoordinationAdminState;
  status: BotConnection;
  groups: { jid: string; name: string }[];
  joins: { jid: string }[];
}
export type BotAdminAction =
  | { action: "repository-review"; id: string; approve: true; licenseConfirmed: true }
  | { action: "repository-review"; id: string; approve: false; text: string }
  | { action: "repository-pin"; id: string; pinned: boolean; confirmed: true }
  | { action: "project" | "contribution" | "away" | "join"; id: string; approve: boolean }
  | { action: "welcome" | "unlink-profile" | "warn"; id: string; confirmed: true }
  | { action: "dismiss" | "resolve-removal"; id: string }
  | { action: "remove"; id: string; confirmed: true }
  | { action: "revoke-contribution"; id: string; text: string }
  | { action: "delivery"; id: string; delivered: boolean; confirmed: true }
  | { action: "join-approvals"; enabled: boolean; confirmed: true }
  | { action: "group-mode"; open: boolean; hours: number; confirmed: true }
  | { action: "resume-schedule" | "retry-group"; confirmed: true }
  | { action: "publish-update"; title: string; text: string }
  | { action: "dismiss-weekly-removal"; id: string; week: string; confirmed: true }
  | { action: "phone-relink" | "phone-unlink"; confirmed: true };

export function isBotAdminAction(input: unknown): input is BotAdminAction {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const string = (key: string, min: number, max: number) => typeof value[key] === "string" && (value[key] as string).trim().length >= min && (value[key] as string).length <= max;
  const keys = (...allowed: string[]) => Object.keys(value).every((key) => ["action", ...allowed].includes(key));
  const id = string("id", 1, 200);
  const confirmed = value.confirmed === true;
  switch (value.action) {
    case "repository-review": return id && (value.approve === true ? value.licenseConfirmed === true && keys("id", "approve", "licenseConfirmed") : value.approve === false && string("text", 10, 300) && keys("id", "approve", "text"));
    case "project": case "contribution": case "away": case "join": return id && typeof value.approve === "boolean" && keys("id", "approve");
    case "repository-pin": return id && confirmed && typeof value.pinned === "boolean" && keys("id", "pinned", "confirmed");
    case "delivery": return id && confirmed && typeof value.delivered === "boolean" && keys("id", "delivered", "confirmed");
    case "welcome": case "unlink-profile": case "warn": case "remove": return id && confirmed && keys("id", "confirmed");
    case "dismiss": case "resolve-removal": return id && keys("id");
    case "revoke-contribution": return id && string("text", 10, 300) && keys("id", "text");
    case "group-mode": return confirmed && typeof value.open === "boolean" && Number.isInteger(value.hours) && Number(value.hours) >= 0 && Number(value.hours) <= 24 && keys("open", "hours", "confirmed");
    case "join-approvals": return confirmed && typeof value.enabled === "boolean" && keys("enabled", "confirmed");
    case "publish-update": return string("title", 3, 80) && string("text", 10, 1200) && keys("title", "text");
    case "dismiss-weekly-removal": return id && confirmed && string("week", 1, 40) && keys("id", "week", "confirmed");
    case "resume-schedule": case "retry-group": case "phone-relink": case "phone-unlink": return confirmed && keys("confirmed");
    default: return false;
  }
}
