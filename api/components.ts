import { randomUUID } from "node:crypto";
import { COMPONENT_STATUSES, parseComponentSubmission, type ComponentSubmission, type ComponentSubmissionStatus } from "../shared/components.js";
import { apiHandler } from "../server/api-security.js";
import { authorize } from "../server/admin.js";
import { getCommunityStore } from "../server/community-store.js";
import { requireSameOriginJson, visitor } from "../server/community.js";
import { getComponentSubmissionStore } from "../server/component-submissions.js";
import { getStore } from "../server/db.js";
import { githubProfile } from "../server/github-auth.js";
import { HttpError, json, readJson } from "../server/http.js";
import { clientKey } from "../server/rate-limit.js";

const PRIVATE = { "cache-control": "private, no-store" };
const STATUS_ORDER: Record<ComponentSubmissionStatus, number> = { pending: 0, accepted: 1, declined: 2 };

function submissionId(input: unknown): string {
  const id = (input as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "invalid_submission", "Choose a submission to review.");
  return id;
}

/** Admins: every submission, the ones awaiting review first, newest first. */
export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    const all = await getComponentSubmissionStore().list();
    all.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt);
    return json(all, 200, PRIVATE);
  });
}

/** Anyone can send a component for review; a signed-in GitHub account is credited. */
export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requireSameOriginJson(req);
    const session = visitor(req, true);
    const limits = await Promise.all([
      getStore().rateLimit(`components:submit:ip:${clientKey(req)}`, 5, 3600),
      getStore().rateLimit(`components:submit:visitor:${session.actor}`, 5, 3600),
    ]);
    if (limits.some((allowed) => !allowed))
      throw new HttpError(429, "rate_limited", "You've sent several components. Try again in an hour.", undefined, { "retry-after": "3600" });
    const parsed = parseComponentSubmission(await readJson(req));
    if (!parsed.ok) throw new HttpError(400, "invalid_submission", parsed.error, parsed.field);
    const profile = await githubProfile(req, getCommunityStore()).catch(() => null);
    const submission: ComponentSubmission = {
      ...parsed.value,
      id: randomUUID(),
      status: "pending",
      createdAt: Date.now(),
      submitter: profile ? { login: profile.login, avatarUrl: profile.avatarUrl } : null,
    };
    if (!await getComponentSubmissionStore().create(submission))
      throw new HttpError(409, "submission_exists", "That component has already been sent for review.", "link");
    return json({ id: submission.id, status: submission.status }, 201, session.headers);
  });
}

/** Admins: accept, decline or reopen a submission. */
export function PATCH(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const admin = await authorize(req);
    requireSameOriginJson(req);
    const body = await readJson(req) as { status?: unknown } | null;
    const id = submissionId(body);
    if (!COMPONENT_STATUSES.includes(body?.status as ComponentSubmissionStatus))
      throw new HttpError(400, "invalid_status", "Choose accept, decline or reopen.");
    const updated = await getComponentSubmissionStore().review(id, body!.status as ComponentSubmissionStatus, admin.login);
    if (!updated) throw new HttpError(404, "not_found", "That submission no longer exists.");
    return json(updated, 200, PRIVATE);
  });
}

/** Admins: remove a submission for good, freeing its link to be sent again. */
export function DELETE(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    requireSameOriginJson(req);
    await getComponentSubmissionStore().remove(submissionId(await readJson(req)));
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  });
}
