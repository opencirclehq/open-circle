<p align="center">
  <img src="public/favicon.svg" alt="OpenCircle" width="72" height="72">
</p>

<h1 align="center">OpenCircle</h1>

<p align="center">GitHub rankings, personal portfolios, community projects and developer tools for Open Source Circle.</p>

<p align="center">
  <a href="https://opencircle.cc"><img src="https://img.shields.io/badge/Open_the_app-04060A?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Open the app"></a>
  <a href="https://chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q?mode=gi_t"><img src="https://img.shields.io/badge/Join_the_community-187C43?style=for-the-badge&amp;logo=whatsapp&amp;logoColor=white" alt="Join the WhatsApp community"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contribute-30363D?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Read the contribution guide"></a>
</p>

<p align="center">
  <a href="https://github.com/opencirclehq/open-circle/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/opencirclehq/open-circle/ci.yml?branch=main&amp;style=flat-square&amp;logo=githubactions&amp;logoColor=white&amp;label=checks" alt="Project checks on main"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/opencirclehq/open-circle?style=flat-square&amp;color=97a3b6" alt="MIT license"></a>
  <a href="https://github.com/opencirclehq/open-circle"><img src="https://img.shields.io/github/stars/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=stars&amp;color=f5c542" alt="GitHub stars"></a>
  <a href="https://github.com/opencirclehq/open-circle/forks"><img src="https://img.shields.io/github/forks/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=forks&amp;color=8b949e" alt="GitHub forks"></a>
</p>

<p align="center">
  <a href="https://github.com/opencirclehq/open-circle/issues"><img src="https://img.shields.io/github/issues/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=issues&amp;color=58a6ff" alt="Open GitHub issues"></a>
  <a href="https://github.com/opencirclehq/open-circle/pulls"><img src="https://img.shields.io/github/issues-pr/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=pull%20requests&amp;color=a371f7" alt="Open pull requests"></a>
  <a href="https://github.com/opencirclehq/open-circle/graphs/contributors"><img src="https://img.shields.io/github/contributors/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;color=3fb950" alt="GitHub contributors"></a>
  <a href="https://github.com/opencirclehq/open-circle/commits/main"><img src="https://img.shields.io/github/last-commit/opencirclehq/open-circle/main?style=flat-square&amp;logo=github&amp;label=last%20commit&amp;color=8b949e" alt="Latest commit on main"></a>
</p>

OpenCircle brings the group's GitHub profiles and public projects into one place. Members join a shared leaderboard, publish personal portfolios, find each other's work and share useful open-source tools. This repository is where we build the app together.

## What you can do

- Join the developer leaderboard and follow rank changes.
- Build a customizable GitHub portfolio at `username.opencircle.cc`.
- Browse Spotlight: one repo per developer with at least 5 stars. Filter by language, star repos on GitHub, upvote projects and save links.
- Find developer tools, submit tools for review and rate them with GitHub sign-in.
- Share projects, give feedback and answer help requests through group participation.
- Find community events, join online sessions, and return for recordings and learning resources.
- Read the community blog, and write posts for review with embedded YouTube videos and Gists.
- Manage members, events, tool submissions and ranking settings through the admin page.

Choose **Light**, **Dark** or **System** from the Appearance control at the top right. Your choice stays saved in this browser; System follows your device’s appearance setting.

GitHub sign-in is required for portfolio editing, tool voting, group participation and admin access. Joining the board requires a personal GitHub profile and a number in the WhatsApp group.

## Community events

Verified members can open Community, then Events beside Discussions and Questions, or use the Participation link. Organisers manage drafts, publishing, cover images, recordings and ordered file/link resources in the admin Events tab. Recordings use direct multipart uploads to a separate private R2 bucket; the public portfolio bucket is unchanged. See the [Events setup and usage guide](docs/events.md).

Upcoming events have a Register button and a name/email form. Registrations persist per signed-in member; organisers can view the private, paginated attendee list under Manage event > View registrations. Covers open in a full-size viewer with zoom and an original-image link. Apply `008_event_registrations.sql` through the normal migration command before releasing registration support.

Event pages use five-character addresses such as `/events/yu48r`. A short address stays the same when the title or schedule changes. Existing title-and-ID links keep opening the same event and switch to its short address; older events receive a short address when saved.

Shared event links show the published event's title, summary and cover image. Only the current cover of a published event is available to preview crawlers through `/api/event-cover`; recordings, resources, registration details and draft covers remain private.

## Blog

Anyone can read the [blog](https://opencircle.cc/blog). Verified members write posts in a rich Markdown editor, and an organiser approves each one in **Admin → Blog** before it is published. Posts can embed YouTube videos and GitHub Gists, link a public GitHub, GitLab or Bitbucket repository, and name the address where they first appeared so search engines credit the original. Each post links to its author's portfolio, and portfolios list their owner's latest posts.

Apply `009_blog.sql` through the normal migration command before releasing the blog. See the [blog guide](docs/blog.md).

## Member portfolios

[Create your portfolio](https://opencircle.cc/portfolio) with GitHub and publish it at `username.opencircle.cc`. Your page includes your GitHub photo, name, bio and up to six public repositories you own, with links to their source and existing live sites.

Choose a light or dark theme, accent colors and a cover image. Add skills, write or import a Markdown README, and customize project titles, descriptions, images and order. Preview your changes before publishing; saved drafts stay private until you publish them.

Contacts are private until you choose to show them. The Hire me button uses your chosen public contact while you are available for work. Your WhatsApp group number is never added to your portfolio automatically.

See the [portfolio guide](docs/portfolios.md) for setup, uploads and subdomain hosting.

## Run locally

Use Node.js **22.13+** and pnpm **11.7.0**. If needed, install pnpm with `npm install --global pnpm@11.7.0`.

The live website and portfolio editor use the [`main`](https://github.com/opencirclehq/open-circle/tree/main) branch.

```bash
git clone --branch main https://github.com/opencirclehq/open-circle.git
cd open-circle
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:5173`, or the address Vite prints if that port is busy. The development server runs the UI and API together.

The local board starts empty. You can browse the UI and run tests without live credentials. Profile lookup and registration need `GITHUB_TOKEN` and a configured WhatsApp membership service. GitHub sign-in needs OAuth credentials; admin access also needs `ADMIN_GITHUB_IDS`.

Start with [`.env.example`](.env.example) and the [configuration guide](docs/configuration.md). Without database credentials, development data stays in the ignored `.data/` directory. The membership bot is a separate private service, so ask an organiser for development access if your change needs it.

## How ranking works

Confirmed help leads the developer board. Each useful contribution confirmed by its recipient or an admin earns 20 points, plus 5 for each different member helped. Earned help no longer expires. All time is the default; 7 days and 30 days filter help by its submission date. Up to three contributions per UTC day and two per recipient in any 30 days count; each project or question counts once. Copied feedback and self-reviews earn nothing. Members can record fixes, testing, documentation and answers from Participation.

GitHub reputation and repo upvotes add at most 20 points in total, using these default weights:

| Metric | Points |
| --- | --- |
| Stars on owned, public repositories that are not forks | 5 per star |
| GitHub followers | 4 per follower |
| Owned, public repositories that are not forks | 1 each, up to 50 |
| Public GitHub contributions since joining OpenCircle | 1 each |
| Community upvotes on owned repositories | 1 each |

Starring another visible community member's public, original repo adds 20 helper points, once per recipient across their qualifying repos, without a time limit. Stars given directly on GitHub count too. More stars across the same member's repos add no extra credit. Self-stars, private repos, forks and nonmembers earn nothing. Removing a star removes its credit on the next successful GitHub refresh; another qualifying star for the same member can still count.

GitHub totals include the whole joining day in UTC and keep accumulating within the 20-point reputation limit. Ties favour helper points, confirmed members helped, GitHub reputation, received stars and earlier registration. Organisers can change the reputation weights. Giving GitHub stars is voluntary. Bot outages preserve the last confirmed helper scores and mark them delayed. GitHub outages preserve cached star activity and mark stats delayed. The GitHub reputation bonus is the same in every period; recent views filter helper credit. Star support is dated from the earliest qualifying star still held for each member.

Spotlight includes the [OpenCircle community repo](https://github.com/opencirclehq/open-circle) alongside each developer's most-starred eligible repo, or their selection during registration. Projects rank by GitHub stars, then forks and repository name. The community repo uses live GitHub metadata and supports the same search, upvotes and bookmarks; its upvotes do not add points to a developer. Tool votes are separate from developer scores. Read the [full ranking and voting rules](docs/reference.md#how-ranking-works) for details.

## Built with

<p align="center">
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&amp;logo=react&amp;logoColor=61DAFB" alt="React 19"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript"></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&amp;logo=vite&amp;logoColor=white" alt="Vite"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-0F172A?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=38BDF8" alt="Tailwind CSS"></a>
  <a href="https://github.com/appdever01/skelo"><img src="https://img.shields.io/badge/Skelo-161B22?style=for-the-badge&amp;logoColor=white" alt="Skelo"></a>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js_22.13+-339933?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.13 or newer"></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm_11.7.0-F69220?style=for-the-badge&amp;logo=pnpm&amp;logoColor=black" alt="pnpm 11.7.0"></a>
  <a href="https://www.radix-ui.com"><img src="https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&amp;logo=radixui&amp;logoColor=white" alt="Radix UI"></a>
  <a href="https://tanstack.com/query"><img src="https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&amp;logo=reactquery&amp;logoColor=white" alt="TanStack Query"></a>
</p>

<p align="center">
  <a href="https://neon.com"><img src="https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&amp;logo=postgresql&amp;logoColor=0B1221" alt="Neon Postgres"></a>
  <a href="https://upstash.com"><img src="https://img.shields.io/badge/Upstash_Redis-00E9A3?style=for-the-badge&amp;logo=redis&amp;logoColor=0B1221" alt="Upstash Redis"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&amp;logo=vitest&amp;logoColor=white" alt="Vitest"></a>
  <a href="https://github.com/opencirclehq/open-circle/actions"><img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&amp;logo=githubactions&amp;logoColor=white" alt="GitHub Actions"></a>
</p>

React 19, TypeScript, Vite and Tailwind CSS, with Radix UI and TanStack Query. The Node.js API uses GitHub GraphQL and supports Neon Postgres or Upstash Redis.

```text
src/          App pages, components and hooks
api/          HTTP request handlers
server/       GitHub, storage, authentication and ranking logic
shared/       Types and validation shared by the UI and API
migrations/   Postgres schema migrations
scripts/      Database setup and verification
tests/        Server and UI tests
docs/         Public setup and reference guides
```

## Open-source credits

OpenCircle's skeleton loaders use [Skelo](https://github.com/appdever01/skelo), created by [Naheem Adisa (@appdever01)](https://github.com/appdever01). Thank you for building it and sharing it with the open-source community.

## Contributing

Bug reports, code, tests and documentation improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, project conventions and the pull request process.

Check [open issues](https://github.com/opencirclehq/open-circle/issues) before starting, or [open an issue](https://github.com/opencirclehq/open-circle/issues/new/choose) to describe a problem or suggest a change. For larger changes, agree on the scope with an organiser first.

Thanks to [everyone who contributes](https://github.com/opencirclehq/open-circle/graphs/contributors) to OpenCircle.

<p align="center">
  <a href="https://github.com/appdever01"><img src="https://avatars.githubusercontent.com/u/154071744?s=64&amp;v=4" alt="appdever01" width="64" height="64"></a>
  <a href="https://github.com/Psybah"><img src="https://avatars.githubusercontent.com/u/144453344?s=64&amp;v=4" alt="Psybah" width="64" height="64"></a>
</p>

## Documentation

| Guide | What it covers |
| --- | --- |
| [Configuration](docs/configuration.md) | Environment variables, GitHub OAuth, membership service and Neon setup. |
| [Development](docs/development.md) | Commands, checks, integration tests and code structure. |
| [App behaviour](docs/reference.md) | Registration, rankings, voting, refreshes, storage and current limits. |
| [API](docs/api.md) | Endpoints, request formats and error responses. |
| [Deployment](docs/deployment.md) | Running the built app and troubleshooting setup problems. |
| [Portfolios](docs/portfolios.md) | Customization, publishing, contact privacy, uploads and subdomains. |
| [Blog](docs/blog.md) | Writing, embeds, review, cross-posting, portfolios and release. |

## Privacy

WhatsApp numbers and participation feedback stay out of public board responses. Board registration checks group membership but does not verify ownership of the submitted GitHub account or phone number. Organisers handle disputed registrations.

Keep real member details and credentials out of issues and pull requests. See the [privacy details and current limits](docs/reference.md#privacy-and-current-limits).

## License

[MIT](LICENSE). The bundled Aspekta font uses the [SIL Open Font License 1.1](public/fonts/OFL.txt).

## Community discussions and questions

Verified group members use `/community` for admin discussions, single-choice polls and approved member questions. Sign-in returns to the selected tab or thread. Admins manage drafts, question revisions, reports, visibility, comments and polls from **Admin → Community**. New questions stay private until approved; an approved version remains visible during revision review.

Community requires PostgreSQL in production, including installations that use Redis for other features. Apply the additive `006_forum.sql` migration through `pnpm db:migrate` before releasing the code. Development without a remote store uses `.data/forum.json`; this file store supports one development process and is not a production adapter. Failed saves are reported and never fall back to browser storage.

Shared discussion and question links show the published title, a short excerpt and a generated preview image. Drafts, hidden posts, pending revisions and comments stay out of previews. Reading and replying still require verified membership. Preview images use the bundled Aspekta fonts under `public/fonts/` and need no external image service.

Member access reuses GitHub sessions and the coordination service's verified link and current tracking flag. If membership checks are paused, stale or unavailable, Community blocks access until they recover. Admin moderation uses the separate admin session. Poll votes use numeric GitHub IDs and a PostgreSQL unique key; thread locks serialize voting, closure and moderation. Only aggregate choices and the viewer's own selection are returned.

Existing Help records remain in **Community → Questions → Earlier help requests**, with their original access, answer confirmations and scores. Participation's Help destination links there, while received-answer confirmation stays under Participation → Feedback. New website help requests must use the moderated Questions form. No records are imported into the new feed, and forum posts, comments and votes do not send WhatsApp messages or earn ranking points.
