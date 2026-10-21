# Member portfolios

Signed-in members can build a portfolio at `/portfolio`. Published pages use `username.opencircle.cc`; `/p/username` is the shareable fallback while wildcard hosting is being configured.

Each portfolio uses the same responsive layout. Owners can choose a light or dark theme, five accent colors, three built-in covers or their own cover image, the image position, name, headline, bio, location, skills, Markdown README, and up to six public repositories. Projects have editable titles, descriptions, images and ordering. The first project receives the featured position on wide screens.

GitHub supplies the profile photo. Importing profile details copies the public name, bio and location into the draft. The repository picker loads public repositories belonging to the signed-in GitHub account, with pagination. Publishing checks each selected repository's public visibility and numeric owner ID again. This feature showcases projects and links to their source and existing live sites; it does not execute or deploy repository code.

## Privacy and publishing

Saving changes updates the private draft. The public page changes only after publishing. Unpublishing removes the public snapshot and keeps the saved draft and address. Competing updates from another tab return a conflict instead of overwriting newer changes.

The address is reserved when the owner first saves and stays attached to the same numeric GitHub account, including after a GitHub username change. Reserved infrastructure names cannot be claimed. The editor allows choosing an available address before the first save.

Email, website, LinkedIn and WhatsApp contacts start private. Owners enter the contact details separately and switch each public contact on themselves. The group membership WhatsApp number is never imported. The hire button opens the owner's chosen public contact and appears only while they are open to work. Turning off that contact also turns off the button. Hiding a contact cannot recall copies visitors already saved.

README rendering supports Markdown and GFM tables, task lists and code blocks. Raw HTML and executable URLs are disabled. Repository README imports resolve common relative Markdown links and images; HTML-only content is omitted. Owners can edit imported writing before publishing.

## Blog posts

A published portfolio lists its owner's six latest published [blog posts](blog.md) under **Writing**, linked back to the blog, and the editor preview shows the same list. Each blog post links its author's name and photo to their published portfolio.

## Storage

Apply the existing versioned migrations with `pnpm db:migrate` before enabling portfolios on a deployed app. `005_portfolios.sql` adds one table; it does not change existing members, sessions, tools or votes. Follow the normal process of testing on an isolated database before applying production migrations.

Portfolio data uses the existing `DATABASE_URL` Postgres connection. Development without a database uses `.data/portfolios.json`. Redis-only production installations need Postgres for portfolios; other Redis-backed features retain their existing behavior.

## Image uploads

Image links and the built-in covers work without upload credentials. To enable uploads, configure these server-only environment variables:

| Variable | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 S3 access key, scoped to the portfolio bucket |
| `R2_SECRET_ACCESS_KEY` | Matching R2 S3 secret |
| `R2_BUCKET_NAME` | Portfolio image bucket |
| `R2_PUBLIC_URL` | Public HTTPS asset domain, such as `https://assets.opencircle.cc` |

Use a dedicated asset hostname for the public bucket. Keep all credentials out of browser-prefixed variables, Git and logs. The [Cloudflare R2 SDK guide](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) describes creating S3-compatible credentials.

Uploads pass through the same-origin authenticated API. PNG, JPEG and WebP files are limited to 3 MiB, checked against file signatures, assigned random account-scoped keys, and uploaded with a bounded timeout. SVG uploads are rejected. Each account is limited to 20 upload attempts an hour. Browser-to-bucket CORS is unnecessary because the server uploads the bytes. Uploaded objects are immutable and retained so editing a draft cannot break a published image; any future cleanup must check both draft and published references.

## Subdomain hosting

1. Point wildcard DNS for `*.opencircle.cc` at the same origin as OpenCircle. Preserve existing explicit records such as `www`, `api` and `assets`.
2. Configure the hosting proxy to accept those hostnames and forward them to the existing Node app, preserving the `Host` header. Install a certificate covering `*.opencircle.cc` at the relevant edge and origin. See [Cloudflare wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) and [Universal SSL coverage](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).
3. Keep GitHub OAuth on the canonical main domain and its existing exact callback URL. Sessions remain host-only; member subdomains are public portfolio views, not editors.
4. Verify a published portfolio over HTTPS, the share metadata, an unknown subdomain, and unpublishing. Then set `PORTFOLIO_SUBDOMAINS_ENABLED=1` so copied links use the subdomain.

The Node server injects portfolio-specific title, description, canonical URL, Open Graph tags and profile structured data into public HTML. Unpublished pages return HTTP 404 with `noindex`; the editor and API responses are private and uncached. `/p/username` remains available after subdomains are enabled and points search engines to the preferred subdomain URL. Static-only hosting needs equivalent server handling for public metadata and HTTP status codes.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. The focused portfolio tests cover ownership, privacy, customization, publishing, stale changes, image guards, real Node HTTP requests and share metadata. Test runners are capped at two workers.

`tests/portfolio-postgres.test.ts` additionally runs the actual migrations and concurrent writes when `PORTFOLIO_TEST_DATABASE_URL` points at a disposable local database named `opencircle_portfolio_test_*`. The test refuses non-loopback hosts and production-like database names. Create and remove that database outside the test. Live R2 credentials and wildcard HTTPS are required to verify the deployed upload and domain setup.
