import type { AdminConfig, AdminState, Board, Weights } from "../shared/types.js";
import { formatNigerianNumber } from "../shared/validation.js";
import { loadConfig, rebuildBoard } from "./board.js";
import { HttpError } from "./http.js";
import type { Store } from "./store.js";
import { adminProfile, adminUserIds, requireAdminOrigin } from "./admin-session.js";
import { getCommunityStore } from "./community-store.js";
import { getStore } from "./db.js";
import { githubSignInAvailable } from "./github-auth.js";
import { clientKey } from "./rate-limit.js";

export function adminConfigured(): boolean {
  return githubSignInAvailable() && adminUserIds().size > 0;
}

export async function authorize(req: Request) {
  if (!adminConfigured()) throw new HttpError(503, "admin_disabled", "Admin access hasn't been configured yet.");
  requireAdminOrigin(req, !["GET", "HEAD"].includes(req.method));
  const store = getStore();
  if (!await store.rateLimit(`admin:ip:${clientKey(req)}`, 120, 60))
    throw new HttpError(429, "rate_limited", "Too many admin requests. Wait a minute and try again.", undefined, { "retry-after": "60" });
  const profile = await adminProfile(req, getCommunityStore());
  if (!profile) throw new HttpError(401, "unauthorized", "Sign in with an approved GitHub account to continue.");
  if (!await store.rateLimit(`admin:account:${profile.id}`, 120, 60))
    throw new HttpError(429, "rate_limited", "Too many admin requests. Wait a minute and try again.", undefined, { "retry-after": "60" });
  return profile;
}

export async function adminState(store: Store, board?: Board): Promise<AdminState> {
  const [records, config, current] = await Promise.all([
    store.listMembers(),
    loadConfig(store),
    board ?? store.getBoard(),
  ]);
  const scores = new Map((current?.members ?? []).map((m) => [m.login.toLowerCase(), m]));
  const members = records
    .map((r) => {
      const pub = scores.get(r.login);
      return {
        login: r.displayLogin,
        nickname: r.nickname,
        avatarUrl: r.avatarUrl,
        score: pub?.score ?? 0,
        communityPoints: pub?.communityPoints,
        communityActivity: pub?.communityActivity,
        stars: r.stars,
        followers: r.followers,
        repos: r.repos,
        activity: r.activity,
        upvotes: pub?.upvotes ?? 0,
        rank: pub?.rank ?? 0,
        delta: pub?.delta ?? 0,
        isNew: pub?.isNew ?? false,
        whatsapp: r.whatsapp.startsWith("+234") ? formatNigerianNumber(r.whatsapp) : r.whatsapp,
        hidden: r.hidden,
        createdAt: r.createdAt,
        statsUpdatedAt: r.statsUpdatedAt,
      };
    })
    // Ranked members first in board order, hidden ones after.
    .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || b.createdAt - a.createdAt);
  return { members, config };
}

const WEIGHT_KEYS: (keyof Weights)[] = ["stars", "followers", "repos", "reposCap", "activity", "upvotes"];

function validConfig(input: unknown): AdminConfig {
  const c = input as Partial<AdminConfig> | null;
  const invite = c?.invite;
  if (!invite || typeof invite.url !== "string" || typeof invite.open !== "boolean" || typeof invite.note !== "string") {
    throw new HttpError(400, "invalid_config", "Invite settings are incomplete.");
  }
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+(\?[\w=&.-]*)?$/.test(invite.url.trim())) {
    throw new HttpError(400, "invalid_invite", "Use a WhatsApp group invite link: https://chat.whatsapp.com/…");
  }
  if (invite.note.trim().length > 200) throw new HttpError(400, "invalid_note", "Keep the fallback note under 200 characters.");

  const weights = {} as Weights;
  for (const key of WEIGHT_KEYS) {
    const value = c?.weights?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000) {
      throw new HttpError(400, "invalid_weights", `Weight "${key}" must be a number from 0 to 10000.`);
    }
    weights[key] = value;
  }
  return { invite: { url: invite.url.trim(), open: invite.open, note: invite.note.trim() }, weights };
}

export async function adminAction(store: Store, body: unknown): Promise<AdminState> {
  const action = (body as { action?: string } | null)?.action;
  const login = String((body as { login?: unknown } | null)?.login ?? "").toLowerCase();

  if (["hide", "unhide", "remove"].includes(action ?? "")) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(login))
      throw new HttpError(400, "invalid_member", "Choose a registered member.");
    if (!await store.getMember(login)) throw new HttpError(404, "not_found", "That member is no longer registered.");
  }

  switch (action) {
    case "hide":
    case "unhide":
      await store.patchMember(login, { hidden: action === "hide" });
      break;
    case "remove":
      await store.deleteMember(login);
      break;
    case "config":
      await store.setConfig(validConfig((body as { config?: unknown }).config));
      break;
    default:
      throw new HttpError(400, "unknown_action", "Unknown admin action.");
  }
  return adminState(store, await rebuildBoard(store));
}
