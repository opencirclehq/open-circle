# Deployment and troubleshooting

[Back to the README](../README.md) · [Configuration](configuration.md)

## Deployment

The build includes the frontend in `dist/` and a standalone Node server in `dist-server/`. On a Node host, run `pnpm build` and start it with `pnpm start`; `PORT` defaults to 3000. The server includes all API routes and keeps OAuth's multiple Set-Cookie headers separate. It derives the public request origin from the configured GitHub callback so HTTPS cookies and origin checks work behind a TLS proxy. Set the exact public `GITHUB_OAUTH_REDIRECT_URI` for that deployment. Only enable `TRUST_PROXY=1` behind a trusted proxy; the server uses the final forwarded IP and otherwise uses the socket peer for request limits.

If using Vercel instead, configure its SPA rewrite and server headers in the hosting project. The Node server supplies the admin page's no-store, noindex and frame protection headers.

1. Import the repository into Vercel and choose a Node.js runtime compatible with the project's requirements.
2. Use `pnpm install --frozen-lockfile` for installation, `pnpm build` for the build, and `dist` for the frontend output directory.
3. Set Neon `DATABASE_URL` in the Vercel environment, and apply `pnpm db:migrate` using the matching `DATABASE_URL_UNPOOLED` before accepting sign-ups. A complete legacy Redis variable pair is also supported when `DATABASE_URL` is unset.
4. Set `GITHUB_TOKEN`, `WHATSAPP_MEMBERSHIP_URL` and `WHATSAPP_MEMBERSHIP_TOKEN` for registration. Configure GitHub OAuth for sign-in, and set `ADMIN_GITHUB_IDS` if organisers need admin access. See [Configuration](configuration.md).
5. Give preview deployments their own Neon branch (or legacy Redis database) and environment values.
6. Deploy, then check the board API, a GitHub preview, registration and moderation using development data first.

Keep `/api/` requests out of any client-route fallback, and allow API handlers up to 60 seconds on serverless hosts. Board responses use short Vercel CDN caching while browsers revalidate; registration and admin responses are not cached.

A static upload of `dist/` only serves the UI. It does not provide registration, GitHub queries or storage. Use the included Node server and configure durable storage before accepting sign-ups.

The admin Overview uses the same configured PostgreSQL or Redis storage as the app. Apply migration `004_analytics.sql` through `pnpm db:migrate` before releasing analytics against PostgreSQL. Redis needs no migration. Traffic history starts with the first recorded public visit after release; old traffic cannot be backfilled. No additional analytics service or credentials are required.

The blog needs PostgreSQL. Apply migration `009_blog.sql` through `pnpm db:migrate` before releasing it. The Node server builds `/sitemap.xml` on each request so published posts are listed; a static deployment serves the sitemap generated at build time, which lists `/blog` but not individual posts. See the [blog guide](blog.md).

## Troubleshooting

| Problem | Check |
| --- | --- |
| pnpm refuses to start. | Use Node.js 22.13+ and the pinned pnpm version. |
| Frozen installation fails after a dependency edit. | Run `pnpm install` in the branch, inspect the changes and commit `package.json` with `pnpm-lock.yaml`. |
| Profile lookup says GitHub is unavailable. | Check `GITHUB_TOKEN`, its expiry, connectivity and server logs. Restart after changing the token. |
| The UI works in preview but API calls fail. | `pnpm preview` serves only built assets. Use `pnpm dev` for the local API or a full deployed backend. |
| Production reports storage is missing. | Set `DATABASE_URL` for Neon, or both parts of a legacy Redis variable pair, in that deployment environment and redeploy. |
| Postgres reports that an `opencircle_` table is missing. | Run `pnpm db:migrate` with that branch's direct `DATABASE_URL_UNPOOLED`. |
| A username is rejected. | Submit a personal profile, not a repository, organisation or GitHub navigation URL. |
| A number or nickname is already registered. | Contact an organiser to resolve the existing record. Formatting differences do not create a new phone identity. |
| A project is absent. | It must be public, owned by a visible registered member, and not a fork. Allow a GitHub refresh cycle to complete. |
| Scores look delayed. | Check the board's update status. GitHub failures retain the last known values; larger groups refresh in batches. |
| The invite still uses an older link. | Saved admin settings override the default in `shared/brand.ts`. Change the stored invite in `/admin`. |
| Local test members remain after a restart. | The development store persists in `.data/dev-store.json`. Move it aside while the server is stopped for a fresh board. |
| Admin access is unavailable or rejected. | Check GitHub OAuth, the exact callback origin and `ADMIN_GITHUB_IDS`; restart after environment changes, then sign in with an approved account. |
| Requests return 429. | Wait for the one-minute limit window rather than retrying repeatedly. |
