# Configuration

[Back to the README](../README.md)

Use this guide when connecting GitHub, group membership or durable storage. The app can render locally with an empty `.env.local`; live lookups and sign-in need their respective services.

## Environment variables

Copy [`.env.example`](../.env.example) to `.env.local` and use your own development credentials.

| Variable | Use | Required |
| --- | --- | --- |
| `GITHUB_TOKEN` | Server-side authentication for read-only GitHub GraphQL queries. Also raises GitHub's rate limit when confirming blog posts' related repositories. | Profile lookup, registration and GitHub refreshes. |
| `SITE_URL` | The public site origin, such as `https://opencircle.cc`, used in canonical links, the sitemap, portfolio addresses and portfolio links to blog posts. | Optional; defaults to `https://opencircle.cc`. Set it for other deployments and for local testing of those links. |
| `ADMIN_GITHUB_IDS` | Comma-separated permanent GitHub user IDs allowed into `/admin`. | Admin access only. |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` | Server-only OAuth credentials and the exact callback URL. | GitHub sign-in and admin access. |
| `TRUST_PROXY` | Set to `1` only when the Node server is behind a trusted reverse proxy that appends or overwrites `X-Forwarded-For`. | Optional on Node hosts. |
| `WHATSAPP_MEMBERSHIP_URL` | Dedicated bot's HTTPS `/api/v1/membership` endpoint. | Profile previews and registration. |
| `WHATSAPP_MEMBERSHIP_TOKEN` | Shared secret of at least 32 characters, matching the dedicated bot. | Profile previews and registration. |
| `DATABASE_URL` | Pooled Neon Postgres connection string, used only by the server. | Production storage, unless using legacy Redis. |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection string for migrations. | `pnpm db:migrate`. |
| `UPSTASH_REDIS_REST_URL` | HTTPS endpoint for the optional legacy Upstash Redis database. | Only when using Redis instead of Postgres. |
| `UPSTASH_REDIS_REST_TOKEN` | Credentials for that Redis endpoint. | Only when using Redis instead of Postgres. |
| `KV_REST_API_URL` | Alternative name for the Redis endpoint, supplied by some Vercel integrations. | Alternative to `UPSTASH_REDIS_REST_URL`. |
| `KV_REST_API_TOKEN` | Alternative name for the Redis token. | Alternative to `UPSTASH_REDIS_REST_TOKEN`. |

`DATABASE_URL` selects Postgres even if legacy Redis variables are also set. Otherwise, one complete Redis variable pair selects Redis. Leaving all database variables unset selects `.data/dev-store.json` in development; production requires durable storage.

### GitHub token

Create a fine-grained personal access token with public repository access only. OpenCircle reads public profile information and does not need permission to write repositories or access private code. GitHub documents that fine-grained tokens include public repository read access in its [GraphQL authentication guide](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-a-personal-access-token).

Put the token in `GITHUB_TOKEN` on the server. Use your own development token and keep its expiry in mind. Never ask members to paste their GitHub token into the app.

### Admin access

Set up the [GitHub OAuth app](#github-oauth), then put approved accounts' permanent numeric GitHub IDs in `ADMIN_GITHUB_IDS`. Resolve each account's ID from GitHub:

```bash
gh api users/<github-username> --jq .id
```

Use the returned numbers, separated by commas, in the server environment. Usernames are not accepted: permanent IDs keep access tied to the same account after a rename. An empty or invalid list disables admin access. Changing the list requires restarting the app; every admin request checks it again. Enable two-factor authentication on the approved GitHub accounts.

Visit `/admin` and choose **Continue with GitHub**. Admin sign-in is separate from community sign-in and expires after one hour. The server stores a hash of the random session token; the browser receives an HttpOnly, SameSite=Strict cookie with Secure and the `__Host-` prefix on HTTPS. Local HTTP is supported only on loopback hosts. Signing out revokes the session in storage and clears private dashboard queries.

Admin changes require same-origin JSON requests with the `X-OpenCircle-Admin: 1` header. Admin routes limit requests per IP and approved account, and private responses are never cached. These session and request controls follow the [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Keep these values in the server environment. Do not prefix them with `VITE_`, put them in client code, include them in screenshots, or commit them. Restart the development server after changing environment variables.

### GitHub OAuth

Create a [GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) with exact callback URLs for each environment. The OpenCircle app uses `http://localhost:5173/api/auth-callback` for local development and `https://opencircle.cc/api/auth-callback` for production. Leave wildcard matching and device flow disabled.

Set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` and `GITHUB_OAUTH_REDIRECT_URI` on the server. The callback must match the current site's origin and end in `/api/auth-callback`. Keep the client secret in ignored local environment files or the hosting secret manager; never use a VITE_ prefix. Apply migration `003_github_tool_votes.sql` before enabling sign-in on Postgres. The existing public-profile lookup token `GITHUB_TOKEN` is separate from these OAuth credentials.

Spotlight stars use the same OAuth app. Regular sign-in stays public-profile only; choosing **Enable GitHub stars** separately requests GitHub’s `public_repo` scope. This scope also permits public code changes, so the connection dialog explains it before redirecting. The app uses the user token only for star status and star changes, keeps it encrypted in the server session and never returns it to the browser. Session expiry or sign-out removes access; rotating the client secret requires reconnecting stars. No extra migration or environment variable is needed.

### Group participation

The `/participation` page requires GitHub sign-in, then links the member's WhatsApp number using a ten-minute code sent from that exact group account in a private chat with the bot. **Open bot chat** opens the currently paired bot's WhatsApp number with the linking command filled in. The member sends it themselves; the bot replies there. `/link` is ignored in the group and does not trigger a private message. Members can share projects for admin approval, give useful feedback, answer help requests, confirm received contributions, see their activity and request breaks. Feedback and phone details stay private. The signup membership gate still runs before GitHub ranking.

The standalone private bot owns participation records, moderation, scheduling and API types. Maintainers enable coordination in that service. See the bot's README for its policy and activation steps.

This app uses `WHATSAPP_MEMBERSHIP_URL` and its token to reach the bot's private coordination endpoints. Keep the URL ending in `/api/v1/membership`; the server derives the other paths. `GET /api/participation` returns the signed-in member's private activity; same-origin `POST /api/participation` creates a linking code or submits a participation action. GitHub OAuth must be configured first. The Node server and Vite development API both expose this route.

The private bot owns the participation contracts. Maintainers with bot access should export them with `node scripts/export-contracts.mjs <path-to-this-checkout>` from the bot repository after a contract change, then validate both services.

### WhatsApp membership bot

Run the separate private [opencircle-whatsapp](https://github.com/appdever01/opencircle-whatsapp) service with its own WhatsApp number, session volume and credentials. Pair that number through the bot console, add it to Open Source Circle, then use **Load groups** to find the group's `jid`. Set that ID as `WHATSAPP_MEMBERSHIP_GROUP_JID` on the bot and restart it. Use the same `WHATSAPP_MEMBERSHIP_TOKEN` on both servers and point this app's `WHATSAPP_MEMBERSHIP_URL` at the bot's `/api/v1/membership` route. The bot runs separately from this app.

The bot checks the configured group's current participant list, including WhatsApp LID identities. It returns only membership status. A disconnected bot, missing configuration or unresolved identity blocks registration with a retry message. There is no development or production bypass. The invite in `/admin` must point to the same group as the bot's configured ID; changing the invite does not change that ID. Existing board entries remain in place; this gate checks new registrations, previews and registration retries.

## Neon development database

Use a development branch, separate from production:

```bash
npx neon@latest init -y --org-id <org-id> --project-id <project-id> --branch <development-branch> --services postgres
npx neon@latest deploy
pnpm db:migrate
```

`neon deploy` provisions the services in `neon.ts` and pulls their variables into `.env.local` (or `.env` if it exists). It does not deploy the app. Migrations use the direct `DATABASE_URL_UNPOOLED`; the app uses the pooled `DATABASE_URL`.


### Bot controls in Admin settings

The website Settings tab includes bot welcome controls, schedules, group posts, private replies, participation thresholds, moderation flags and editable message formats. Set `WHATSAPP_ADMIN_TOKEN` on the website server and the private bot server to the same separate random secret of at least 32 characters. It must differ from `WHATSAPP_MEMBERSHIP_TOKEN`. Keep it runtime-only and never prefix it with `VITE_`.

The existing membership URL derives the bot settings endpoint. Approved GitHub admins use the website's existing protected session; their browser never receives the bot credential or console password. The bot and website must both include the settings contract before enabling this connection. With no admin token, membership and participation continue normally while the settings panel reports unavailable.

Saving retains unrelated bot data, pairing and group controls. Message-only changes do not restart participation observation. Changes to participation thresholds start a fresh observation period, with existing history retained. Saves use a separate settings version, so a stale page cannot overwrite another admin's changes.

Message variables use `{{name}}`. Each format lists its supported variables and required links or values. Previews use sample data and send nothing; individual resets restore the shipped default. Pending unsent automatic content is replaced by future batches using the saved formats, while the second half of an already-started welcome remains queued. Historical or uncertain deliveries are never rewritten or replayed.
