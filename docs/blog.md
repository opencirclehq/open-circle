# Blog

[Back to the README](../README.md) · [API](api.md)

The blog publishes writing from Open Source Circle members. Anyone can read it at `/blog`. Verified members write posts, and an organiser reviews each one before it is published.

## Writing a post

Open `/blog` and choose **Write a post**. Writing needs GitHub sign-in and a WhatsApp account linked through Participation, the same check as Community. If membership checks are paused or unavailable, saving is blocked until they recover.

| Field | Rules |
| --- | --- |
| Title | Required. 8–120 characters to submit. |
| Summary | 30–280 characters to submit. Shown in the post list, on portfolios and in link previews. |
| Topic | Required, even for drafts. Nothing is chosen for you. |
| Post | Markdown, 300–40,000 characters to submit. |
| Related repository | Optional. A public repository on github.com, gitlab.com or bitbucket.org. |
| Originally published at | Optional. The `https://` address where the post first appeared. |

Drafts may be unfinished; submitting holds the post to every minimum. **Save draft** keeps the post private. **Submit for review** sends it to organisers. Saving a submitted post pulls it back into your drafts.

The editor reads and writes plain Markdown. It offers headings, bold, italic, strikethrough, inline code, lists and task lists, links, images, tables, code blocks with a language and horizontal rules. **Preview as published** shows the post exactly as readers will see it. The source view (the Markdown button) shows and edits the Markdown directly.

Published posts never contain anything the page would drop, so submission is refused when a post has:

- raw HTML, outside a code block;
- an image without alt text, or with an address that is not `https://`;
- a link that does not start with `https://`, `http://`, `mailto:`, `/` or `#`.

The editor explains the problem while you write. Drafts may still contain these while you work.

### Embeds

A YouTube video or GitHub Gist link on its own line becomes an embed. Use the embed button in the toolbar, or put the link on a line by itself. A link inside a sentence stays a link.

| Accepted | Example |
| --- | --- |
| YouTube video, short or live stream | `https://youtu.be/ID`, `https://www.youtube.com/watch?v=ID&t=1m30s`, `https://youtube.com/shorts/ID` |
| GitHub Gist | `https://gist.github.com/user/ID` |

Videos use YouTube's privacy-enhanced player (`youtube-nocookie.com`), starting at `t=` when given. A Gist runs in a sandboxed frame with no access to OpenCircle; it only reports its height. Readers without JavaScript and search engines see the plain link.

### Related repository

The server confirms the repository with its code host when you save, and stores the host's own name and address for it. Profiles, organisation pages, private or deleted repositories and other hosts are refused. Paths inside a repository, such as `/tree/main/src`, are trimmed to the repository's home page. If the code host cannot be reached, saving is blocked rather than accepting an unchecked link; try again shortly. A repository confirmed earlier is not checked again unless it changes.

`GITHUB_TOKEN`, when set, raises GitHub's rate limit for these checks.

### Cross-posting

When **Originally published at** is set, the post's canonical link points to that address, so search engines credit the original. The post page says where it first appeared, keeps its own share link and card, and is left out of OpenCircle's sitemap. The address must be `https://` and cannot be an OpenCircle page.

## Review

Organisers review posts in **Admin → Blog**. Queues: awaiting review (oldest first), published, hidden, drafts and changes requested, not accepted, and all posts.

| Action | Effect |
| --- | --- |
| Approve and publish | Publishes the post. Its address is set from the title on first approval and never changes afterwards. |
| Request changes | Returns it to the author with a required note, shown in **Your posts** and above the editor. |
| Decline | Marks it not accepted, with a required note. The author can revise and submit again. |
| Hide / Restore | Takes a published post off every public list, page, portfolio and the sitemap, with a required reason; restoring brings it back. |
| Feature / Stop featuring | Lists a published post first. |

Edits to a published post are a revision. The approved copy stays live until an organiser approves the change. Every submission and decision is kept in the post's history, which only organisers see.

Each member can have 3 posts awaiting review and 20 unpublished posts at once.

## Authors and portfolios

Every post shows its author. The author's name and photo link to their portfolio when they have published one, at their subdomain once subdomains are enabled (`PORTFOLIO_SUBDOMAINS_ENABLED=1`) or `/p/<slug>` otherwise. Without a published portfolio they link to the author's GitHub profile. The link is looked up on every read, so unpublishing a portfolio removes it straight away. Posts end with an **About the author** section linking to both.

Published portfolios list the owner's six latest posts under **Writing**, linked back to the blog. The portfolio editor's preview shows the same list.

## Addresses, search and sharing

| Route | Indexed | Purpose |
| --- | --- | --- |
| `/blog` | Yes | Published posts, featured first, filterable by topic. |
| `/blog/<slug>` | Yes | One post. Missing or hidden posts return 404. |
| `/blog/mine` | No | Your drafts, submissions and reviewer notes. |
| `/blog/write`, `/blog/write/<id>` | No | The editor. |

The server renders each post's title, summary, canonical link and share card into the page, with the article text in the page's no-JavaScript fallback. Share cards are generated images at `/api/blog-image`. The Node server builds `/sitemap.xml` on each request so new posts are included. Static hosts serve the build-time sitemap, which lists `/blog` but not individual posts.

## Storage and release

Posts are stored in PostgreSQL. Apply `009_blog.sql` with `pnpm db:migrate` before releasing. Production refuses to run the blog without PostgreSQL, including installations that use Redis for other features. Development without `DATABASE_URL` keeps posts in the ignored `.data/blog.json`, for a single development process.

Blog posts do not earn leaderboard points.
