import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blogDestination, blogEmbed, blogSlug, blogSlugFromPath, parseCanonicalUrl, parseRepositoryUrl, validateBlogContent } from "../shared/blog";
import { blogMarkdownProblem } from "../shared/blog-markdown";
import { defaultPortfolio } from "../shared/portfolio";
import { commandBlog, listBlog, readBlog } from "../server/blog";
import { LocalBlogStore } from "../server/blog-store";
import { blogHtml } from "../server/blog-seo";
import { MemoryPortfolioStore } from "../server/portfolio-store";
import { alice, blogContract, bob, command, content, publish } from "./helpers/blog-contract";

const verifyRepository = vi.hoisted(() => vi.fn());
vi.mock("../server/blog-repository", () => ({ verifyRepository }));
let portfolios: MemoryPortfolioStore;
vi.mock("../server/portfolio-store", async (original) => ({ ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => portfolios }));

let store: LocalBlogStore;
beforeEach(() => {
  store = new LocalBlogStore(null);
  portfolios = new MemoryPortfolioStore(null);
  verifyRepository.mockReset();
});

describe("local blog store", () => blogContract(() => store));

describe("post content", () => {
  it("chooses nothing for the author: a topic is required and optional links must be sent as null", () => {
    const { topic: _topic, ...withoutTopic } = content();
    expect(validateBlogContent(withoutTopic, false)).toMatchObject({ ok: false, field: "topic" });
    expect(validateBlogContent({ ...content(), topic: "" }, false)).toMatchObject({ ok: false, field: "topic" });
    const { canonicalUrl: _canonical, ...withoutCanonical } = content();
    expect(validateBlogContent(withoutCanonical, false)).toMatchObject({ ok: false, field: "canonicalUrl" });
    const { repository: _repository, ...withoutRepository } = content();
    expect(validateBlogContent(withoutRepository, false)).toMatchObject({ ok: false, field: "repository" });
    expect(validateBlogContent(content(), true)).toMatchObject({ ok: true, repository: null, value: { canonicalUrl: null, repository: null } });
  });

  it("lets drafts be unfinished but holds submissions to every minimum", () => {
    expect(validateBlogContent(content({ summary: "", body: "A start" }), false).ok).toBe(true);
    expect(validateBlogContent(content({ title: "  " }), false)).toMatchObject({ ok: false, field: "title" });
    expect(validateBlogContent(content({ body: "Too short" }), true)).toMatchObject({ ok: false, field: "body" });
    expect(validateBlogContent(content({ summary: "Short" }), true)).toMatchObject({ ok: false, field: "summary" });
    expect(validateBlogContent(content({ title: "Bell\u0007 in the title" }), false)).toMatchObject({ ok: false, field: "title" });
  });

  it("accepts only repository home pages on GitHub, GitLab and Bitbucket", () => {
    expect(parseRepositoryUrl("https://github.com/opencirclehq/open-circle/tree/main/src")).toEqual({ ok: true, value: { provider: "github", fullName: "opencirclehq/open-circle", url: "https://github.com/opencirclehq/open-circle" } });
    expect(parseRepositoryUrl("https://www.github.com/owner/project.git").value?.url).toBe("https://github.com/owner/project");
    expect(parseRepositoryUrl("https://gitlab.com/group/subgroup/project/-/tree/main").value).toEqual({ provider: "gitlab", fullName: "group/subgroup/project", url: "https://gitlab.com/group/subgroup/project" });
    expect(parseRepositoryUrl("https://bitbucket.org/workspace/repo/src/main").value?.fullName).toBe("workspace/repo");
    for (const rejected of ["https://github.com/opencirclehq", "https://github.com/orgs/opencirclehq", "https://github.com/settings/profile", "http://github.com/owner/project", "https://example.com/owner/project", "https://gitlab.com/username", "https://user:pass@github.com/owner/project", "github.com/owner/project", "https://github.com/owner/.."]) {
      expect(parseRepositoryUrl(rejected).ok, rejected).toBe(false);
    }
  });

  it("accepts an original address elsewhere on the web, never this site", () => {
    expect(parseCanonicalUrl("https://dev.to/alice/first-pr#comments")).toEqual({ ok: true, value: "https://dev.to/alice/first-pr" });
    for (const rejected of ["http://dev.to/alice/first-pr", "https://opencircle.cc/blog/x", "https://www.opencircle.cc/blog/x", "javascript:alert(1)", "dev.to/alice", "https://localhost/post"]) expect(parseCanonicalUrl(rejected).ok, rejected).toBe(false);
  });

  it("embeds only real YouTube videos and GitHub Gists", () => {
    expect(blogEmbed("https://youtu.be/dQw4w9WgXcQ?t=1m30s")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: 90 });
    expect(blogEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: 42 });
    expect(blogEmbed("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ", start: null });
    expect(blogEmbed("https://gist.github.com/octocat/6cad326836d38bd3a7ae")).toEqual({ kind: "gist", user: "octocat", id: "6cad326836d38bd3a7ae" });
    for (const rejected of ["https://youtu.be/short", "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"><script>", "https://youtube.com/channel/UC123", "https://gist.github.com/octocat", "https://gist.github.com/oct<o>cat/6cad326836d38bd3a7ae", "https://vimeo.com/123456", "http://youtu.be/dQw4w9WgXcQ"]) {
      expect(blogEmbed(rejected), rejected).toBeNull();
    }
  });

  it("refuses at submission anything the published page would drop", () => {
    expect(blogMarkdownProblem(content().body)).toBeNull();
    expect(blogMarkdownProblem("<script>alert(1)</script>")).toMatch(/raw HTML/);
    expect(blogMarkdownProblem("A paragraph with <u>underline</u>.")).toMatch(/raw HTML/);
    expect(blogMarkdownProblem("![](https://example.com/a.png)")).toMatch(/alt text/);
    expect(blogMarkdownProblem("![A diagram](http://example.com/a.png)")).toMatch(/https/);
    expect(blogMarkdownProblem("[click](javascript:alert(1))")).toMatch(/Links must/);
    expect(blogMarkdownProblem("```html\n<script>shown as code</script>\n```\n\n![A diagram](https://example.com/a.png)")).toBeNull();
  });

  it("derives addresses and sign-in destinations strictly", () => {
    expect(blogSlug("Ship it: my FIRST PR!")).toBe("ship-it-my-first-pr");
    expect(blogSlug("Mine")).toBeNull();
    expect(blogSlug("Write")).toBeNull();
    expect(blogSlugFromPath("/blog/write")).toBeNull();
    expect(blogSlugFromPath("/blog/ship-it")).toBe("ship-it");
    expect(blogDestination("/blog/write/0b6c3a5e-6f7a-4c1e-9d2b-3c4d5e6f7a8b")).toBe("/blog/write/0b6c3a5e-6f7a-4c1e-9d2b-3c4d5e6f7a8b");
    expect(blogDestination("/blog/write/../admin")).toBeNull();
    expect(blogDestination("https://evil.test/blog")).toBeNull();
  });
});

describe("blog server", () => {
  it("refuses raw HTML, missing alt text and unsafe links when submitting", async () => {
    for (const body of [`${content().body}\n\n<iframe src="https://evil.test"></iframe>`, `${content().body}\n\n![](https://example.com/a.png)`, `${content().body}\n\n[x](javascript:alert(1))`]) {
      await expect(commandBlog(store, alice, command({ action: "submit", id: randomUUID(), version: 0, content: content({ body }) }))).rejects.toMatchObject({ status: 400, field: "body" });
    }
    await expect(commandBlog(store, alice, command({ action: "save", id: randomUUID(), version: 0, content: content({ body: "<b>draft</b>" }) }))).resolves.toMatchObject({ review: "draft" });
  });

  it("confirms a related repository with its host once and stores the host's own name", async () => {
    verifyRepository.mockResolvedValue({ provider: "github", fullName: "OpenCircleHQ/open-circle", url: "https://github.com/OpenCircleHQ/open-circle" });
    const id = randomUUID();
    const saved = await commandBlog(store, alice, command({ action: "save", id, version: 0, content: content({ repository: "https://github.com/opencirclehq/open-circle/issues" }) }));
    expect(verifyRepository).toHaveBeenCalledWith({ provider: "github", fullName: "opencirclehq/open-circle", url: "https://github.com/opencirclehq/open-circle" });
    expect(saved.revision?.repository).toEqual({ provider: "github", fullName: "OpenCircleHQ/open-circle", url: "https://github.com/OpenCircleHQ/open-circle" });
    await commandBlog(store, alice, command({ action: "save", id, version: saved.version, content: content({ repository: "https://github.com/OpenCircleHQ/open-circle" }) }));
    expect(verifyRepository).toHaveBeenCalledTimes(1);
    verifyRepository.mockRejectedValueOnce(Object.assign(new Error("We couldn't find a public repository at that address."), { status: 400 }));
    await expect(commandBlog(store, alice, command({ action: "save", id, version: saved.version + 1, content: content({ repository: "https://github.com/owner/missing" }) }))).rejects.toThrow("couldn't find");
    expect((await commandBlog(store, alice, command({ action: "save", id, version: saved.version + 1, content: content({ repository: null }) }))).revision?.repository).toBeNull();
  });

  it("links authors to their published portfolio, and to nothing once it goes offline", async () => {
    vi.stubEnv("SITE_URL", "https://opencircle.test");
    const post = await publish(store);
    expect((await readBlog(store, post.slug!)).author.portfolioUrl).toBeNull();
    const draft = { ...defaultPortfolio({ id: alice.profile.id, login: "alice", avatarUrl: "" }), displayName: "Alice Okafor" };
    await portfolios.write(alice.profile.id, "Alice", draft, 0, "publish");
    expect((await readBlog(store, post.slug!)).author.portfolioUrl).toBe("https://opencircle.test/p/alice");
    vi.stubEnv("PORTFOLIO_SUBDOMAINS_ENABLED", "1");
    expect((await listBlog(store, new URL("https://opencircle.test/api/blog"))).items[0].author.portfolioUrl).toBe("https://alice.opencircle.cc");
    await portfolios.write(alice.profile.id, "Alice", draft, 1, "unpublish");
    expect((await readBlog(store, post.slug!)).author.portfolioUrl).toBeNull();
    const bobPost = await publish(store, bob, content({ title: "Reviewing code kindly" }));
    expect((await readBlog(store, bobPost.slug!)).author).toMatchObject({ login: "Bob", portfolioUrl: null });
    vi.unstubAllEnvs();
  });

  it("renders the same safe HTML on the server, with embeds left as links", () => {
    const html = blogHtml("# Title becomes h2\n\n<script>alert(1)</script>\n\n<https://youtu.be/dQw4w9WgXcQ>\n\n[external](https://example.com) [unsafe](javascript:alert(1))\n\n![A cat](http://example.com/cat.png)");
    expect(html).toContain("<h2>Title becomes h2</h2>");
    expect(html).not.toMatch(/<script|<iframe|javascript:|http:\/\/example\.com\/cat/);
    expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
  });
});
