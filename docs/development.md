# Development

[Back to the README](../README.md) · [Contributing](../CONTRIBUTING.md)

## Commands and checks

pnpm is the canonical package manager. Commit `pnpm-lock.yaml` when a dependency change updates it.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the UI and local API on port 5173. |
| `pnpm test` | Run the automated tests once. |
| `pnpm db:migrate` | Apply pending Postgres migrations with the direct connection. |
| `pnpm test:postgres` | Verify migrations, storage concurrency and real HTTP registration on a disposable Neon branch. |
| `pnpm typecheck` | Check the app, API and shared TypeScript code. |
| `pnpm lint` | Run ESLint. |
| `pnpm build` | Type-check and build the frontend into `dist/` and the Node server into `dist-server/`. |
| `pnpm build:server` | Build the standalone Node server. |
| `pnpm start` | Start the built app and API; `PORT` defaults to 3000. |
| `pnpm preview` | Serve the built frontend on port 4173. This does not run the API. |

Before opening a pull request, run these checks in order:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

GitHub Actions runs the same checks on pushes and pull requests. The workflow in `.github/workflows/ci.yml` uses the pinned pnpm version and does not need application secrets.

The test configuration caps workers at two. Keep focused tests for the area you change, especially validation, scoring, repository pagination, registration conflicts, moderation and public-data privacy. Do not replace a failing check with a weaker one.

Community persistence tests use isolated local JSON by default. To test the real Postgres and Redis adapters, install those services locally and run:

```sh
COMMUNITY_TEST_DATABASE_URL='postgresql:///postgres?host=/tmp' COMMUNITY_TEST_REDIS=1 pnpm exec vitest run --project server tests/community-adapters.test.ts --maxWorkers=2
```

The adapter harness rejects non-local Postgres connections, creates its own temporary database, and starts a temporary Redis instance on a private Unix socket. It removes those resources afterward. These optional tests are skipped in the default suite and never use `.env.local` credentials.

With `pnpm dev` running, these commands check the local HTTP path without browser automation:

```bash
curl --fail-with-body http://localhost:5173/api/board
curl --fail-with-body http://localhost:5173/api/preview \
  -H 'content-type: application/json' \
  --data '{"github":"octocat","nickname":"Octo","whatsapp":"<your group number with country code>"}'
```

The second request needs a working GitHub token, configured membership bot and a number in the group. Test registrations against your local store or a separate development database.

For Postgres verification, create a disposable Neon branch and supply its pooled and direct URLs as `POSTGRES_TEST_URL` and `POSTGRES_TEST_URL_UNPOOLED`, then run `pnpm test:postgres`. Keep `DATABASE_URL` pointing at the normal app branch. The check refuses to use that same endpoint, requires `GITHUB_TOKEN`, starts and stops a temporary app server and simulated membership service, and registers `octocat` with a fictional phone number. It verifies the gate through HTTP without contacting WhatsApp; it does not establish that a live bot is paired. Use a fresh test branch without an existing `octocat` member and delete the branch after verification.

## Project structure

```text
src/
  components/board/   Rankings, repositories, registration and tools
  components/ui/      Shared UI primitives
  hooks/              Board polling and community state
  lib/                API client, formatting and browser identity
  pages/              Board, participation, admin and missing-page views
api/                  HTTP handlers for board, sign-in, voting and moderation
server/               GitHub, ranking, authentication and storage logic
shared/               Browser-safe types, ranking, tool data and validation
migrations/           Versioned Postgres schema
scripts/              Migrations and Postgres verification
public/               Favicon, Aspekta font and font license
tests/                Server and UI regression coverage
config/typescript/    App, API, build-tool and test compiler settings
docs/                 Public setup and reference guides
.github/              Checks, issue forms and pull request template
neon.ts               Neon service configuration
vitest.config.ts      Test environments and worker limits
```

`@/` resolves to `src/` and `@shared/` resolves to `shared/`. Keep server secrets and Node-only imports inside `server/` or `api/`. Shared modules must be safe to import into the browser.

`tsconfig.json` is the single root TypeScript entry point. It holds shared settings and references the app, API, Node tooling and test configurations in `config/typescript/`. Each keeps the checks and libraries its environment needs. Generated TypeScript caches go in `node_modules/.cache/typescript/`.

The frontend uses React 19, Vite 6, TypeScript, Tailwind CSS 3, Radix-based UI primitives and TanStack Query. The API uses Web `Request`/`Response` handlers and Node.js features; it is not an edge-only backend.

### Forum storage verification

The standard suite includes the durable local store contract, authorization handlers, OAuth return paths, moderation and member/admin UI workflows. Run the PostgreSQL contract against a disposable local database named `opencircle_forum_test_*`:

```bash
createdb opencircle_forum_test_local
FORUM_TEST_DATABASE_URL=postgresql://localhost/opencircle_forum_test_local pnpm test tests/forum-postgres.test.ts
dropdb opencircle_forum_test_local
```

The contract applies all migrations, checks migration idempotence, truncates only forum tables in that disposable database and tests concurrent voting, duplicate requests, closure races, database uniqueness, rollback and persistence through a new store connection. Never point it at a shared or production database. Test workers remain capped at two.

### Blog storage verification

The blog contract in `tests/helpers/blog-contract.ts` runs against the local file store in the standard suite. To run it against PostgreSQL, with unique addresses, rollback and concurrent edits, use a disposable local database named `opencircle_blog_test_*`:

```bash
createdb opencircle_blog_test_local
BLOG_TEST_DATABASE_URL=postgresql://localhost/opencircle_blog_test_local pnpm test tests/blog-postgres.test.ts
dropdb opencircle_blog_test_local
```

The UI tests replace the rich editor with a plain text area, because the editor needs a real browser. Check editor changes in `pnpm dev`.
