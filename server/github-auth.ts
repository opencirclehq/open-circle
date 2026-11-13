import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GitHubProfile } from "../shared/community.js";
import type { CommunityStore } from "./community-contract.js";
import { HttpError } from "./http.js";
import { adminUserIds, createAdminSession } from "./admin-session.js";
import { openStarAuthorization, sealStarAuthorization } from "./github-star-authorization.js";
import { forumDestination } from "../shared/forum.js";
import { participationDestination } from "../shared/participation-navigation.js";
import { blogDestination } from "../shared/blog-paths.js";

const SESSION_COOKIE = "opencircle_github";
const STATE_COOKIE = "opencircle_oauth";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function configuration() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if (url.pathname !== "/api/auth-callback" || url.search || url.hash || url.username || url.password) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return { clientId, clientSecret, redirectUri, origin: url.origin };
  } catch {
    return null;
  }
}

export function githubSignInAvailable(): boolean {
  return configuration() !== null;
}

function configFor(req: Request) {
  const config = configuration();
  if (!config) throw new HttpError(503, "github_setup", "GitHub sign-in isn't set up yet.");
  if (new URL(req.url).origin !== config.origin) throw new HttpError(400, "github_origin", "Open the configured site to sign in with GitHub.");
  return config;
}

function cookieValue(req: Request, name: string): string | undefined {
  return req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function cookie(req: Request, name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function sessionHash(req: Request): string | null {
  const token = cookieValue(req, SESSION_COOKIE);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export async function githubProfile(req: Request, store: CommunityStore): Promise<GitHubProfile | null> {
  if (!githubSignInAvailable()) return null;
  const hash = sessionHash(req);
  const profile = hash ? await store.readSession(hash) : null;
  return profile ? { id: profile.id, login: profile.login, ...(profile.name ? { name: profile.name } : {}), avatarUrl: profile.avatarUrl, ...(hash && openStarAuthorization(profile.starAuthorization, hash, profile.id) ? { starsConnected: true } : {}) } : null;
}

export function profileActor(profile: GitHubProfile): string {
  return createHash("sha256").update(`github:${profile.id}`).digest("hex");
}

export function beginGitHubSignIn(req: Request): Response {
  const config = configFor(req);
  const admin = new URL(req.url).searchParams.get("returnTo") === "/admin";
  if (admin && !adminUserIds().size) throw new HttpError(503, "admin_disabled", "Admin access hasn't been configured yet.");
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const participation = participationDestination(new URL(req.url).searchParams.get("returnTo"));
  const eventReturn = new URL(req.url).searchParams.get("returnTo");
  const events = eventReturn && /^\/events(?:\/[a-z0-9-]{1,130})?$/.test(eventReturn) ? eventReturn : null;
  const forum = forumDestination(new URL(req.url).searchParams.get("returnTo"));
  const portfolio = new URL(req.url).searchParams.get("returnTo") === "/portfolio";
  const repositories = new URL(req.url).searchParams.get("returnTo") === "/repositories";
  const blog = blogDestination(new URL(req.url).searchParams.get("returnTo"));
  const stars = !admin && new URL(req.url).searchParams.get("stars") === "1";
  const payload = Buffer.from(JSON.stringify({ state, verifier, expiresAt: Date.now() + 600_000, admin, participation, portfolio, repositories, stars, events, forum, blog })).toString("base64url");
  const signature = createHmac("sha256", config.clientSecret).update(payload).digest("base64url");
  const destination = new URL("https://github.com/login/oauth/authorize");
  destination.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, state, scope: stars ? "public_repo" : "", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return new Response(null, { status: 302, headers: { location: destination.toString(), "cache-control": "no-store", "set-cookie": cookie(req, STATE_COOKIE, `${payload}.${signature}`, 600) } });
}

async function githubJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), redirect: "error" });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) throw new Error("GitHub response unavailable");
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(502, "github_unavailable", "GitHub sign-in couldn't finish. Try again.");
  }
}

export async function finishGitHubSignIn(req: Request, store: CommunityStore): Promise<Response> {
  const config = configFor(req);
  const clearState = cookie(req, STATE_COOKIE, "", 0);
  let returnTo = "/tools";
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const saved = cookieValue(req, STATE_COOKIE);
    if (!saved || saved.length > 4096 || !state || !/^[a-f0-9]{64}$/.test(state)) throw new HttpError(400, "github_state", "Sign-in expired. Try again.");
    const [payload, signature, extra] = saved.split(".");
    const expected = createHmac("sha256", config.clientSecret).update(payload).digest("base64url");
    if (extra || signature?.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new HttpError(400, "github_state", "Sign-in expired. Try again.");
    const savedState = JSON.parse(Buffer.from(payload, "base64url").toString()) as { state?: unknown; verifier?: unknown; expiresAt?: unknown; admin?: unknown; participation?: unknown; portfolio?: unknown; repositories?: unknown; stars?: unknown; events?: unknown; forum?: unknown; blog?: unknown };
    if (typeof savedState.state !== "string" || savedState.state.length !== state.length || !timingSafeEqual(Buffer.from(savedState.state), Buffer.from(state)) || typeof savedState.expiresAt !== "number" || savedState.expiresAt <= Date.now() || typeof savedState.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(savedState.verifier)) throw new HttpError(400, "github_state", "Sign-in expired. Try again.");
    if (savedState.admin === true) returnTo = "/admin";
    else if (savedState.participation === true) returnTo = "/participation";
    else if (participationDestination(savedState.participation)) returnTo = participationDestination(savedState.participation)!;
    else if (typeof savedState.events === "string" && /^\/events(?:\/[a-z0-9-]{1,130})?$/.test(savedState.events)) returnTo = savedState.events;
    else if (forumDestination(savedState.forum)) returnTo = forumDestination(savedState.forum)!;
    else if (savedState.portfolio === true) returnTo = "/portfolio";
    else if (savedState.repositories === true) returnTo = "/repositories";
    else if (blogDestination(savedState.blog)) returnTo = blogDestination(savedState.blog)!;
    if (url.searchParams.has("error") || !code || code.length > 256) throw new HttpError(400, "github_denied", "GitHub sign-in was cancelled. Try again when you're ready.");
    const token = await githubJson("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri, code_verifier: savedState.verifier }) });
    if (typeof token.access_token !== "string" || token.token_type !== "bearer") throw new HttpError(502, "github_exchange", "GitHub sign-in couldn't finish. Try again.");
    const user = await githubJson("https://api.github.com/user", { headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10", "user-agent": "OpenCircle" } });
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0 || typeof user.login !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user.login) || user.type !== "User") throw new HttpError(502, "github_profile", "GitHub didn't return a personal profile. Try again.");
    const profile: GitHubProfile = { id: Number(user.id), login: user.login, ...(typeof user.name === "string" && user.name.trim() ? { name: user.name.trim() } : {}), avatarUrl: `https://avatars.githubusercontent.com/u/${user.id}?s=80` };
    if (savedState.admin === true) {
      const adminCookie = await createAdminSession(req, store, profile);
      const headers = new Headers({ location: returnTo, "cache-control": "no-store" });
      headers.append("set-cookie", clearState);
      headers.append("set-cookie", adminCookie);
      return new Response(null, { status: 302, headers });
    }
    const session = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(session).digest("hex");
    const scopes = typeof token.scope === "string" ? token.scope.split(/[ ,]+/) : [];
    if (savedState.stars === true && !scopes.some((scope) => scope === "public_repo" || scope === "repo"))
      throw new HttpError(403, "github_stars_permission", "GitHub did not grant permission to star repositories. Try connecting again.");
    await store.createSession(hash, { ...profile, ...(savedState.stars === true ? { starAuthorization: sealStarAuthorization(token.access_token, hash, profile.id) } : {}) }, Date.now() + SESSION_SECONDS * 1000);
    const previous = sessionHash(req);
    if (previous) await store.removeSession(previous);
    const headers = new Headers({ location: returnTo, "cache-control": "no-store" });
    headers.append("set-cookie", clearState);
    headers.append("set-cookie", cookie(req, SESSION_COOKIE, session, SESSION_SECONDS));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const reason = error instanceof HttpError ? error.code : "github_failed";
    const destination = new URL(returnTo, config.origin);
    destination.searchParams.set("signin", reason);
    return new Response(null, { status: 302, headers: { location: `${destination.pathname}${destination.search}${destination.hash}`, "cache-control": "no-store", "set-cookie": clearState } });
  }
}

export async function signOutGitHub(req: Request, store: CommunityStore): Promise<string> {
  const hash = sessionHash(req);
  if (hash) await store.removeSession(hash);
  return cookie(req, SESSION_COOKIE, "", 0);
}
