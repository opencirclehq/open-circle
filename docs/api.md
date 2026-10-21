# API

[Back to the README](../README.md)

The frontend calls same-origin API routes. Vite serves these during development; the bundled Node server serves the same handlers after deployment.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /api/board` | None. | Public members, one eligible spotlight repo per member plus the OpenCircle community repo, timestamps, invite settings and reputation weights. Members include combined helperPoints, confirmed helpfulContributions and helpedMembers, credited starHelps and uncapped githubScore. helpersUpdatedAt and helpersDelayed describe confirmed-help freshness; statsDelayed describes GitHub data including stars given. communityRepositoryCheckedAt and communityRepositoryDelayed describe the community repo metadata refresh. The final score caps GitHub reputation at 20 points and adds confirmed help and 20 points per star-supported member without expiry. All time is the primary members list; periods["7d"] and periods["30d"] contain separately ranked public snapshots with period-specific help. helperHistoryReady indicates whether the new help history has been loaded. Current GitHub reputation stays capped at 20 in every period. Raw star receipts stay private. |
| `POST /api/preview` | JSON with `github`, `nickname`, `whatsapp`. | Profile stats, score and eligible spotlight choices after confirming group membership. Only public, original repos with at least 5 stars are returned in `profile.projects`; aggregate profile stats remain complete. The old username-only GET is rejected. |
| `POST /api/register` | JSON with `github`, `nickname`, `whatsapp` and optional `spotlightRepositoryId`. | Registered login and the updated public board. Omit `spotlightRepositoryId` to pick the most-starred eligible repo automatically. Selections are checked against current GitHub data; ineligible choices return 400 with `invalid_spotlight`. |
| `GET /api/community` | Visitor cookie, created if absent. | Tools, public vote counts and this visitor's vote selections. |
| `POST /api/vote` | Repository: JSON `{ "target": "repo:ID", "active": true }` with visitor cookie. Tool: `{ "target": "tool:ID", "value": 1 }` with GitHub session; value is -1, 0 or 1. | Target, saved state and current vote score. |
| `GET /api/repository-stars?id=ID` | GitHub session with optional star permission; up to 20 Spotlight IDs. | Whether stars are connected and the current GitHub star state and count for each repository. Private, uncached response. |
| `POST /api/repository-stars` | Same-origin JSON `{ "repositoryId": "ID", "active": true }` and GitHub star permission. | Idempotently adds or removes the person’s GitHub star on a listed public Spotlight repository and returns its confirmed state and count. Limited to 30 changes per GitHub account per minute. |
| `GET /api/auth-start` | None; optional `returnTo=/repositories&stars=1`. | Redirect to GitHub public-profile sign-in. Only the explicit stars flow requests `public_repo` permission. |
| `GET /api/auth-callback` | GitHub code, matching state and OAuth cookie. | Verified session, then redirect to `/tools`, `/repositories`, `/portfolio`, `/participation`, a blog page or `/admin` according to the sign-in flow. |
| `GET /api/participation` | Signed-in GitHub session. | Private group activity, projects, help requests and contributions. |
| `POST /api/participation` | Same-origin JSON with a signed-in GitHub session; a linking request uses `{ "action": "link", "phone": "+2348000000000" }`. | A linking code or the updated private participation state. |
| `POST /api/auth` | Same-origin JSON request with GitHub session cookie. | Revokes the session and clears its cookie. |
| `POST /api/tools` | JSON with `name`, `url`, `description` and `category`. | Pending tool, not included in the public directory. |
| `GET /api/tools` | Approved admin session cookie. | Full managed catalog: built-in tools, approved tools and private pending submissions. |
| `PATCH /api/tools` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body `{ "id": "TOOL_ID", "action": "approve" }`. | Approves a submitted tool for public listing and voting. |
| `PATCH /api/tools` | Same admin credentials and headers; JSON with `action: "create"`, `name`, `url`, `description` and `category`. | Validates and publishes a tool immediately. Duplicate links return 409. |
| `DELETE /api/tools` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body `{ "id": "TOOL_ID" }`. | Removes a built-in or submitted tool and its votes. |
| `GET /api/admin` | Approved admin session cookie. | Members including WhatsApp numbers, plus settings. |
| `POST /api/admin` | Approved admin session cookie, same-origin JSON and `X-OpenCircle-Admin: 1`; body is an admin action. | Updated admin state. |
| `GET /api/admin-session` | No credentials required. | Whether admin access is configured, and the current approved admin profile if signed in. |
| `DELETE /api/admin-session` | Same-origin JSON and `X-OpenCircle-Admin: 1`. | Revokes the current admin session and clears its cookie. |
| `POST /api/analytics` | Same-origin JSON with a public `page` path and `referrer` origin. | Records a page view and establishes an anonymous analytics cookie. |
| `GET /api/analytics?days=30` | Approved admin session; `days` is 7, 30 or 90. | Private traffic totals, daily chart data, popular pages, referral domains and community growth. |
| `GET /api/blog` | Optional `page` and `topic`. | Published posts, featured first, 12 per page. Each has its author and, when they have published one, the author's portfolio address. Public and cacheable; revalidate with `If-None-Match`. |
| `GET /api/blog?slug=SLUG` | None. | One published post with its Markdown body, original address and related repository. Missing and hidden posts return 404. |
| `GET /api/blog?mine=1` and `GET /api/blog?id=ID` | Signed-in GitHub session linked to a current group member. | The member's own drafts, submissions and reviewer notes, or one of them. Other members' posts return 404. |
| `POST /api/blog` | Same-origin JSON from a verified member: `action` (`save` or `submit`), `requestId`, `id`, `version` and `content` with `title`, `summary`, `topic`, `body`, `canonicalUrl` and `repository`. A new post uses a new UUID and `version` 0. `canonicalUrl` and `repository` are required keys; send `null` for none. | The private draft. Submitting checks every minimum and refuses raw HTML, images without alt text and unsafe links. A related repository is confirmed with its code host. See the [blog guide](blog.md). |
| `GET /api/blog-admin?queue=pending&page=1` | Approved admin session. `queue` is required: `pending`, `published`, `hidden`, `drafts`, `rejected` or `all`. | Posts in that review queue. |
| `GET /api/blog-admin?id=ID` | Approved admin session. | One post with its history. |
| `POST /api/blog-admin` | Admin session, same-origin JSON and `X-OpenCircle-Admin: 1`. `{ "action": "review", "decision": "approve" \| "changes" \| "reject", "reason" }` or `{ "action": "moderate", "operation": "hide" \| "restore" \| "feature" \| "unfeature", "reason" }`, each with `requestId`, `id` and `version`. | The updated post. Requesting changes and declining need a reason of at least 5 characters; hiding needs at least 3. |
| `GET /api/blog-image?slug=SLUG` | None. | A 1200×630 PNG share card for a published post. |

Admin actions are `hide`, `unhide` and `remove`, with a `login`, or `config`, with complete invite and weight settings. The exact request and response types live in [`shared/types.ts`](../shared/types.ts).

Errors have a consistent shape:

```json
{
  "error": {
    "code": "invalid_github",
    "message": "That isn't a valid GitHub username.",
    "field": "github"
  }
}
```

The `field` property is optional. Validation failures return 400, missing profiles return 404, identity conflicts return 409, organisation profiles return 422, throttled requests return 429, and unavailable GitHub or storage returns 503. JSON request bodies are limited to 4 KiB, except portfolio drafts (125 KiB). Portfolio image uploads retain their separate 3 MiB limit. Unexpected failures return 500 without exposing their internal details to the client.

Profile previews and registration have one-minute request limits:

| Operation | Per client IP | Per GitHub username |
| --- | --- | --- |
| Preview | 30 | 10 |
| Registration | 10 | 5 |

These limits protect the lookup and registration paths from repeated requests. Group membership is checked separately through the bot; request limits do not verify identity.

Community writes require same-origin JSON requests and the visitor cookie established by `GET /api/community`; voting and sharing require cookies to be enabled. Votes are limited to 60 requests per minute for both the client IP and visitor. Tool submissions are limited to five per hour for both. Rejected requests return 429 with `Retry-After`. Community request/response contracts live in `shared/community.ts`, with shared tool validation in `shared/tool-validation.ts`.

Analytics counts distinct browsers using a separate HttpOnly cookie and stores only its namespaced hash, daily totals, allowlisted public paths and referral hostnames. It does not store IP addresses, referral paths or query strings. Known bot user agents, DNT/GPC opt-outs and admin paths are excluded. Blocked scripts, disabled cookies and multiple devices affect the audience counts. Returning visitors visited on at least two UTC days within the selected period. Referral totals count page views, with missing or internal referrals grouped as Direct. New visits prune records to a 180-day window; Redis also expires old records automatically. The collection start timestamp remains. Previous-period traffic comparisons appear only after a complete prior period has been collected. Growth counts use existing member and tool creation dates and exclude deleted records. The write endpoint permits 240 requests per IP and 60 per anonymous browser per minute; the existing request limiter handles IP keys separately from analytics records.

## Shared request protection

Every API handler uses `server/api-security.ts`. Handled API requests have separate read and write allowances of 240 requests per client IP per minute across endpoints and cookies, alongside the narrower operation and account limits above. Polling cannot spend the allowance needed to sign up, vote or sign out. GitHub sign-in uses its own 60-request-per-IP minute allowance, so browsing limits do not block the redirect or callback. OAuth callbacks also allow 30 attempts per IP per minute; starting sign-in allows 20 per hour. Throttled responses include `Retry-After`, and storage failures do not bypass enforcement.

Mutations require the appropriate content type and reject foreign origins, opaque origins and requests marked as coming from a sibling site. JSON is required except for the image upload endpoint, which accepts PNG, JPEG and WebP. Requests without browser origin metadata remain available to direct API clients; the normal authorization and rate limits still apply. CORS is not enabled. URLs are limited to 4,096 characters, and declared body sizes are checked before the Node and Vite adapters buffer them. Existing streaming byte limits also apply when Content-Length is absent or inaccurate.

API responses include `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and `X-Robots-Tag: noindex`. Responses default to `Cache-Control: no-store`; the public board retains its explicit revalidation/CDN policy. Unsupported methods return JSON 405 responses with `Allow`, and unknown API paths return JSON 404 responses. The standalone Node server limits request time to 30 seconds, headers to 10 seconds and header bytes to 16 KiB.

IP keys use the trusted adapter/platform client address, hash it before storage, normalize IPv4-mapped addresses and group IPv6 addresses by /64. Arbitrary `X-Forwarded-For` values are not trusted by handlers. On Node, only `TRUST_PROXY=1` enables the adapter's final forwarded address; enable it only when a trusted proxy appends or overwrites that header and direct access to the app is restricted.

These controls limit abusive traffic; they do not establish ownership of anonymous registration details or turn repository browser votes into verified-person votes. The existing identity limits are described in the [app reference](reference.md#privacy-and-current-limits).

## Efficient polling

The public board sends a weak ETag. A matching `If-None-Match` returns 304 without a response body, while the usual board read and refresh checks still run. Browsers can revalidate their cached public snapshot; any snapshot change produces a new tag. The Node server also uses low-cost gzip for public JSON of at least 1 KiB when the client accepts it and compression reduces its size. Private, no-store and no-transform responses keep their existing behavior. Compressed and uncompressed board responses share the weak tag and vary by Accept-Encoding.

Polling respects `Retry-After`, retains existing results while waiting and resumes automatically. Read requests made during a known 429 cooldown do not hit the network again. Permanent client errors are not retried immediately; transient failures retain bounded retries. Cancelling a board request aborts its fetch instead of reporting an offline error. Board responses compare against the latest cache after the request finishes, so a slow poll cannot overwrite a newer signup result. Cached directory data remains usable for voting and tool sharing during a read-only cooldown; each write still passes its server-side identity, origin, validation and operation limits.


## Bot settings

`GET /api/bot-settings` returns bot status and the current `version`, `policy`, `community`, `options` and `messages` to an approved admin. Responses are private and not cached. `POST /api/bot-settings` accepts the same configuration fields with the last-read version and requires the existing admin cookie, canonical Origin, JSON content type and `X-OpenCircle-Admin: 1` header.

The server derives `/api/v1/settings` from its membership URL and uses the separate runtime-only `WHATSAPP_ADMIN_TOKEN`. Membership credentials do not grant settings access. Unknown message variables, missing required values and out-of-range controls return 400. A stale settings version returns 409 without a partial save. Request bodies are bounded to 1 MiB; other endpoints keep their existing limits. Missing bot admin configuration or an unavailable/invalid upstream response returns 503 without exposing credentials.

## Community forum

`GET /api/forum` requires a signed-in GitHub account, a verified participation link and a current membership check. Responses, including failures, are never publicly cached. Use `kind=discussion|question`, `page`, `search` (up to 150 characters), `category`, `status=open|resolved` and `mine=1` for feeds. `mine=1` includes only the viewer's submissions. `id=<UUID>&page=<number>` returns a thread and a page of comments and one-level replies. Feeds and comments have 15 items per page; reply pages also include their parent comments for context. Hidden parents and other members' unpublished content return 404.

`POST /api/forum` accepts `create` for discussions and questions, `edit`, `comment`, `like`, `vote`, `report` and author `moderate` actions for question resolution. Member submissions and revisions require admin approval, including requests that send `publish: true`. Approved content remains visible while a revision is reviewed. `mine=1` includes both kinds owned by the viewer. Every command needs a fresh `requestId` UUID; reuse the same UUID and body when retrying a failed request. Changed bodies need a new UUID. This protects against duplicate posts, comments and votes. Edits and moderation also require the current `version`, preventing stale review actions. Titles allow 5–160 characters, explanations 15–12,000, comments 1–6,000 and reports 5–1,000. Requests have a 48,000-byte limit. Member writes are limited to 20 per account and 60 per IP per minute, in addition to the shared API limits.

`like` sets `liked: true|false` for the signed-in GitHub account. Include `id` for the thread and an optional `commentId` to like a comment or reply instead of the post. Repeated likes from the same numeric account count once. Thread and comment responses expose `likeCount` and the viewer's `liked` state, with no liker identities. Hidden content, replies to hidden comments and unpublished posts reject likes. Locking comments still allows likes. Comment likes do not change post likes, poll votes or moderation versions; existing comments start at zero and need no additional migration.

`GET|POST /api/forum-admin` uses the existing admin session and origin protections; mutations also require `x-opencircle-admin: 1`. Feed queues are `pending`, `reports`, `published`, `hidden`, `drafts` and `all`. Admins can create/edit/publish discussion drafts, review question revisions and moderate posts, comments and reports. Rejections and change requests require a private explanation. Other moderation needs a reason; decisions are audited with actor, time and submitted content. Internal approval notes appear only in admin history; rejection/change reasons are shared only with the author.

Polls belong to admin discussions and have 2–6 unique options, an optional closing timestamp and manual closure. `vote` specifies an `optionId` and the current poll response’s `ballot` token; the numeric session identity supplies the voter. A later vote replaces the previous choice while voting is open. A stale ballot is rejected if settings changed before the first vote. Poll settings are fixed after the first vote. Hidden, unpublished and closed polls reject new votes. Responses include totals and the viewer's choice, with no voter list.

Community activity adds directly to the leaderboard's existing help and capped GitHub reputation score. Published discussions/questions earn 5 points (up to 2 per UTC day), comments/replies earn 2 (up to 5 daily and 2 per thread), and likes and poll votes earn 1 (up to 10 likes and 5 votes daily). A comment needs at least 15 normalized characters. Repeated normalized post/comment content, self-likes, voting on your own poll, comments on your own post and replies to yourself earn nothing. Liking another member's comment earns the same credit as liking a post. Sharing and page views earn nothing because they do not prove a completed interaction.

Activity is keyed by immutable numeric GitHub account ID and target, persisted atomically with the forum command in the existing thread JSONB document, and never included in forum responses. Retries, revisions and changed poll choices cannot add awards. Unlike and moderation revoke the affected credit; hiding a parent also excludes its replies and their likes. Restoration or re-liking uses the original date. Existing published posts and comments use their saved dates; older likes/votes without dates count only in All time, capped at one daily allowance, without fabricated recent history. Each period applies the same daily and duplicate rules before filtering dates.

Public board members include `communityPoints` and `communityActivity` with credited `posts`, `comments`, `likes`, `votes` and `points`. `communityCheckedAt`/`communityDelayed` describe freshness. The board checks community activity every 10 seconds without forcing a GitHub refresh. Last saved community totals remain during a storage outage; unresolved account IDs remain unknown until the next GitHub refresh. Existing helper-history availability still controls recent-period views. No migration is required; applied migrations remain unchanged.

`GET /api/forum-legacy` is member-only and returns the existing coordination Help requests, the viewer's related contributions and assignments. Legacy answers, closure, assignment decline and recipient confirmation continue using `/api/participation`. New `help` submissions to that endpoint return `409 questions_moved` so new website questions cannot bypass approval. Existing bot contracts and records are unchanged.
