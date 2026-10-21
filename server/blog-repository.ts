import { REPOSITORY_HOSTS, type BlogRepository } from "../shared/blog.js";
import { HttpError } from "./http.js";

const missing = () => new HttpError(400, "blog_repository_missing", "We couldn't find a public repository at that address. Check the link, or leave the field empty.", "repository");
const unavailable = () => new HttpError(503, "blog_repository_unavailable", "We couldn't reach the code host to confirm that repository. Try again in a minute.", "repository");

async function read(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown> | null> {
  let response: Response;
  try { response = await fetch(url, { headers: { accept: "application/json", "user-agent": "OpenCircle", ...headers }, redirect: "follow", signal: AbortSignal.timeout(8_000) }); }
  catch { throw unavailable(); }
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw unavailable();
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw unavailable();
  return body as Record<string, unknown>;
}

function confirmed(provider: BlogRepository["provider"], fullName: unknown, url: unknown, isPublic: boolean): BlogRepository {
  if (!isPublic || typeof fullName !== "string" || typeof url !== "string" || !URL.canParse(url)) throw missing();
  const home = new URL(url);
  if (home.protocol !== "https:" || home.hostname !== REPOSITORY_HOSTS[provider]) throw missing();
  return { provider, fullName, url: `https://${REPOSITORY_HOSTS[provider]}/${fullName}` };
}

/** Confirms with the code host that the repository exists and is public, using its canonical name. */
export async function verifyRepository(repository: BlogRepository): Promise<BlogRepository> {
  if (repository.provider === "github") {
    const token = process.env.GITHUB_TOKEN?.trim();
    const body = await read(`https://api.github.com/repos/${repository.fullName}`, { accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10", ...(token ? { authorization: `Bearer ${token}` } : {}) });
    if (!body) throw missing();
    return confirmed("github", body.full_name, body.html_url, body.private === false);
  }
  if (repository.provider === "gitlab") {
    const body = await read(`https://gitlab.com/api/v4/projects/${encodeURIComponent(repository.fullName)}`);
    if (!body) throw missing();
    return confirmed("gitlab", body.path_with_namespace, body.web_url, body.visibility === "public");
  }
  const body = await read(`https://api.bitbucket.org/2.0/repositories/${repository.fullName}`);
  if (!body) throw missing();
  const links = body.links as { html?: { href?: unknown } } | undefined;
  return confirmed("bitbucket", body.full_name, links?.html?.href, body.is_private === false);
}
