# App behaviour

[Back to the README](../README.md)

## What the app does

The registration flow asks for a GitHub username first. It accepts a bare username, `@username`, `github.com/username` or a full GitHub profile URL. Repository URLs and organisation profiles are rejected.

The username field and signup card show the public GitHub profile photo, with a fallback if it cannot load. Profile and group membership checks still happen on the server before registration.

Clicking “Rank me” asks for a nickname and the WhatsApp number used in the group. The server confirms that number is a current group member before fetching GitHub stats or adding the member to the board. A nonmember gets the group invite and can check again after joining. Looking up an existing member shows their current position instead of creating another entry.

The app includes:

- A developer leaderboard with the top three highlighted and rank movement shown for the last 24 hours.
- Spotlight with one owned, public, non-fork repository per visible member, each with at least 5 stars.
- Community upvotes, repository search, language filters and sorting by stars, upvotes or recent updates.
- A tools directory with curated open-source tools, community submissions, categories, upvotes and downvotes.
- Saved repositories and tools, kept locally in the visitor's browser.
- A group invite that organisers can replace or pause.
- An explanation of the current ranking weights.
- An admin page for moderation, invite settings and ranking weights.

| Route | Purpose |
| --- | --- |
| `/` | Join the board and browse developer rankings. |
| `/repositories` | Find, upvote and save Spotlight projects. |
| `/tools` | Discover, share, rate and save developer tools. |
| `/participation` | Link a group account, share projects and give feedback after GitHub sign-in. |
| `/blog` | Read members' posts; verified members write them for review. See the [blog guide](blog.md). |
| `/how-it-works` | Open the ranking explanation over the board. |
| `/admin` | Organiser controls, restricted to approved GitHub accounts. |

## How ranking works

### Developer rankings

The default score is:

```text
github reputation = (stars × 5)
      + (followers × 4)
      + min(public original repositories, 50)
      + public contributions since joining OpenCircle
      + community upvotes on owned repositories
```

| Metric | Points | Counted data |
| --- | --- | --- |
| Stars | 5 per star | Total stars across repositories the member owns that are public and not forks. |
| Followers | 4 per follower | The profile's follower count. |
| Repositories | 1 per repository, capped at 50 | Owned, public, non-fork repositories. |
| Activity | 1 per contribution, uncapped | Public GitHub contributions from the member's OpenCircle joining day onward. |
| Repository upvotes | 1 per upvote | Active community upvotes on the member's listed public repositories. |

Activity includes commits, issues, pull requests, pull request reviews and repository contributions returned by GitHub's contribution collection. Counts follow GitHub's rules and can differ from what a member expects from their contribution graph.

Contribution days use UTC, including the whole joining day. Totals accumulate beyond 30 days and across years. Each refresh replaces the total from GitHub, so retries do not add points twice. Existing members are backfilled from their saved registration date; their previous 30-day totals are excluded until that first successful refresh. GitHub failures preserve the last successful cumulative total.

The developer score is helper points plus at most 20 points of GitHub reputation. Each confirmed useful contribution earns 20 points and each distinct recipient adds 5. Earned points remain in the default All time view. The 7 days and 30 days tabs show qualifying help submitted within those rolling periods, excluding the exact cutoff timestamp. Only three contributions per UTC submission day and two per recipient in any 30 days count. Limits are applied across history before filtering, so switching periods cannot bypass them. Each project or question counts once, with copied feedback and self-reviews excluded. Recipient identities follow linked GitHub accounts across group rejoining.

A star on another visible member's public, original repository earns 20 helper points, once per recipient across all their qualifying repos, with no automatic expiry. Stars given on GitHub or through OpenCircle both count. Self-stars, forks, private repos and owners outside the visible board do not count. Repeated refreshes and unstar/restar cycles cannot stack credit. A successful GitHub refresh replaces the active receipts, so removing the last qualifying star for a member removes that credit. GitHub outages retain cached receipts with stats marked delayed; all-time credit remains while the qualifying stars are held. Recent views use the earliest qualifying star still held for each recipient. The help count combines confirmed contributions and credited stars. The displayed stars-given count is credited support, not every GitHub star the member has given. Confirmed-help recipient counts stay separate because a recipient can overlap the star recipients.

Members sort by score, combined helper points, confirmed recipients, uncapped GitHub reputation, received stars and earliest registration. Registration checks group membership before fetching the profile and calculating the member's position.

The default weights live in `shared/ranking.ts`. Organisers can change them in `/admin`, and the ranking explanation summarizes the capped bonus. These weights only affect the secondary reputation component, capped at 20 ranking points in total and unchanged across period views. Stars, contributions and upvotes still retain their full displayed totals. Helper scores come from one authenticated bot aggregate, checked at most once per minute during normal board rebuilding. Failed or invalid responses preserve stored helper points and mark the public snapshot delayed. Admins can revoke confirmed help with a recorded reason; the next successful aggregate removes its credit.

The website requests version 2 of the private helper aggregate, which returns all-time, seven-day and thirty-day totals together. Deploy the bot update before the website. Version 1 remains available for older callers during rollout. If history is unavailable, all-time confirmed cached credit stays visible with a delay notice; recent views wait for history rather than relabeling legacy 28-day totals. Full GitHub star history is backfilled on successful refreshes. Truncated, invalid or failed upstream responses retain the last confirmed data and mark it delayed.

New-member labels last 24 hours. All-time movement indicators show places gained or lost within a 24-hour movement window; recent period views omit movement history. These indicators are not a historical analytics report.

### Repository spotlight

Spotlight includes `opencirclehq/open-circle` alongside one repository per developer, sorted by stars, then forks, then full repository name (`owner/name`). It uses GitHub stars directly and does not use the developer scoring formula. The community-owned repository uses its real organization identity and GitHub metadata, with the same five-star minimum, search, votes and bookmarks. Its upvotes do not add developer ranking points. Metadata refreshes in the background at most once per minute; failed requests retain the cached entry and mark `communityRepositoryDelayed`, while a confirmed deletion or ineligible repository removes it.

Only repositories owned by visible members with at least 5 stars appear. Forks and private repositories are excluded. The most-starred eligible repo is picked automatically; developers can choose another eligible repo during registration. If a choice disappears or falls below 5 stars, Spotlight falls back to the most-starred eligible repo. Developers without an eligible repo still join the developer leaderboard and gain a spotlight when a repo qualifies.

GitHub results are paginated in batches of 100, so a member's eligible projects and star total are not limited to their first 100 repositories. All owned, public, original repos still contribute to developer statistics. Organisation-owned projects are outside the current member model.

Hiding a member also hides their repositories from the public board.

### GitHub sign-in for tool voting

Tool voting requires a verified GitHub account. Browsing and saving tools do not require sign-in. Follow the [GitHub OAuth setup](configuration.md#github-oauth) to enable voting in your environment.

### Community upvotes and tools

Spotlight defaults to GitHub stars. Visitors can sort by community upvotes or last GitHub update, search by project or builder, filter by language and bookmark individual repos. Repository upvotes boost the owner's developer score without changing GitHub stars. Removing an upvote removes its points, and tool votes do not affect developer scores.

The tools directory starts with six curated open-source tools. Each curated entry links to its source repository. Visitors can submit another tool with a name, public HTTPS URL, description and category. The server validates submissions, normalizes URLs and rejects duplicate links; it never fetches submitted URLs. Submissions stay private and cannot receive votes until an organiser approves them in `/admin`. Organisers can also add tools directly for immediate publication. The admin catalog includes built-in tools and all submissions. Removing any tool also removes its votes, and built-in removals persist across restarts. Removed tools can be added again; visitor submissions still need approval. The directory allows up to 1,000 saved tools, including pending reviews.

Tools use one vote per signed-in GitHub account. An upvote adds one and a downvote subtracts one; selecting the same direction removes the vote, and switching direction replaces it. Top rated sorts by the net score. The server identifies the voter by GitHub's durable user ID, so a renamed profile or another browser does not create a second vote. This is one vote per GitHub account, not one vote per person. Old anonymous tool votes are retained in storage but are excluded from the account-based scores because their owner cannot be verified.

GitHub sign-in requests public identity only. Sessions last seven days and use opaque HttpOnly, SameSite cookies; only their hashes are stored. Signing out revokes that session. OAuth state and PKCE protect the callback. GitHub access tokens are used only to check the authenticated profile and are not stored or returned to the browser. Browsing tools, saving links and submitting tools for admin review do not require sign-in.

Repository upvotes retain their existing browser identity: an opaque HttpOnly, SameSite cookie lasting one year. Clearing cookies or changing browsers permits another repository vote. Shared-IP and voter limits apply to both voting paths.

Saved links use browser local storage and do not sync between devices. They remain separate from public upvotes. Clearing site data removes them.

## Updates and storage

### Refresh behaviour

The client checks the board every 10 seconds while the page is active. It keeps whichever snapshot is newer, so a delayed response cannot overwrite the result returned immediately after registration.

GitHub stats refresh about once a minute. Refreshes are triggered by board requests, so there is no scheduled job running when nobody is reading the board. The server returns the stored snapshot first and refreshes in the background. Vercel's `waitUntil` keeps that work alive after the response.

Each refresh handles up to 48 visible members, starting with those whose stats are oldest. GitHub lookups batch four profiles per request and run up to three batches at a time. Larger groups take multiple cycles to refresh everyone.

If GitHub fails or rate-limits a request, the app retains the last known stats and marks updates as delayed. It does not erase the board. Renamed or deleted GitHub accounts retain their last known numbers until an organiser removes them. Changes can take longer than one minute during failures or large refresh queues.

### Local development

Without Postgres or Redis credentials, the development store writes member records, settings and the board snapshot to `.data/dev-store.json`. Restarting the server keeps local sign-ups. The file contains WhatsApp numbers and must stay out of Git.

Community tools and votes use a separate `.data/community-store.json` file. Postgres uses `migrations/002_community.sql` for community records and `migrations/003_github_tool_votes.sql` for profile votes and sessions; Redis uses the `oc:community:` namespace. Both follow the same storage selection as member records. Apply pending migrations before enabling these features on Postgres. Community responses include personal vote selections and are private, uncached responses; they must never be shared through a CDN cache.

To start with an empty local board, stop the server and move `.data/dev-store.json` outside the project. Restart the server to create a new store. Moving the file preserves any test data you may want later.

### Postgres

Neon Postgres stores member records, settings and public board snapshots. Database constraints reserve GitHub logins, phone numbers and case-insensitive nicknames atomically. Partial updates preserve other fields, and a refresh cannot recreate a deleted member. Refresh locks and fixed-window request limits are shared across server instances, with expired entries cleaned up during requests.

The Node API uses `pg`, a small shared connection pool and Vercel's `attachDatabasePool` helper. Migrations live in `migrations/`; the runner applies them in a transaction, records their checksums and serializes concurrent migration runs. Run `pnpm db:migrate` before starting an app against a new database. Keep a separate Neon branch for development and test migrations there before applying them to production.

The setup does not copy existing members or settings from Redis or `.data/dev-store.json`. Keep those stores available if you need to migrate their data separately.

### Legacy Redis

When Redis credentials are present, both development and deployed handlers use Upstash Redis. Registration claims the GitHub login, normalised phone number and nickname together, so concurrent requests cannot create duplicate identities. GitHub logins and nicknames are compared without case sensitivity.

The store also keeps the public board snapshot, invite settings, scoring weights and a short-lived refresh lock. Vercel and other production environments refuse to fall back to local file storage when durable storage is missing, because separate server instances cannot safely share that file.

Use separate Redis databases for local work, preview deployments and production. Connecting a development environment to production Redis gives it access to real members and moderation settings.

## Admin and moderation

Configure `ADMIN_GITHUB_IDS` and GitHub OAuth, then visit `/admin`. Only approved GitHub accounts can load private member data or make changes. The Members, Tools and Settings tabs keep moderation separate from configuration. Search members by nickname, GitHub username or phone, filter hidden entries, and review pending or approved tool submissions. Removal asks for confirmation. Use **Sign out** when finished.

Organisers can:

- Hide a member while preserving their record and reserved identity. Hidden members cannot register again until restored or removed.
- Restore a hidden member to the public board.
- Remove a member and release their GitHub login, phone number and nickname. Removal allows them to register again; it is not a permanent ban.
- Replace the group invite, pause it, or edit the message shown when the invite is unavailable.
- Change ranking weights and caps. The board is rebuilt after a settings change.
- Search the full tools catalog, review pending submissions, approve or reject them, and add tools directly for immediate publication. Remove built-in or submitted tools and their votes. The initial built-in catalog is defined in `shared/tools.ts`; saved removals take precedence.

The admin route asks search engines not to index it, but this is not an access control. The server checks the approved GitHub ID and admin session before returning private data or applying changes.

## Privacy and current limits

Public board and registration responses include GitHub details, nicknames and rankings. They do not include WhatsApp numbers. Numbers are stored in the private member record and are returned only through the authorized admin API. People with database access or the local development file can also read those records.

Registration validates number format and uniqueness, then confirms the supplied number is in the WhatsApp group. It does not prove the person submitting the number owns it: there is no OTP. Nicknames are saved with the registration, not matched against changeable WhatsApp display names. All numbers need an explicit `+` country code, for example `+234 803 123 4567`. Local numbers and `00` prefixes are rejected. Nicknames must be 2 to 24 characters, use the supported letters, numbers and punctuation, and contain no links.

GitHub lookup confirms that a personal profile exists. It does not prove that the person submitting it owns the account. Board registration does not require GitHub sign-in, and the browser's remembered username only highlights a row. Tool voting, group participation and admin access use separate GitHub sign-in flows. Organisers must handle disputed registrations.

Members cannot currently edit their nickname or number themselves. An organiser can remove the record so they can register again. Repeating a registration with the same GitHub login and phone returns the existing entry; it does not update its nickname.

Do not post tokens, real phone numbers, admin responses or data-store exports in issues or pull requests. Report sensitive security or privacy problems privately to a group organiser before sharing details publicly.

## List pagination

Developer ranks below the podium, repositories, tools, admin members and tool review show 20 items per page. Projects, help requests and feedback show 10; catch-up updates and upcoming sessions show five. Page controls show the current range, provide previous/next navigation on phones and add page buttons on wider screens. Filtering or changing sort order returns to page one. If an item is removed and the current page disappears, the list moves to the last available page.

Pagination happens after filtering and sorting the shared snapshots. The board and community API responses still contain their full snapshots, preserving ranking, signup lookup, counts and polling behavior. This bounds rendered rows, not response size. The portfolio repository picker retains its existing paged GitHub requests. Finding your rank opens the page containing that member, including immediately after registration.
