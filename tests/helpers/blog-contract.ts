import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { BLOG_DRAFT_LIMIT, BLOG_PENDING_LIMIT, type BlogContentInput, type BlogDraft } from "../../shared/blog";
import { commandBlog, listBlog, myBlog, portfolioPosts, queueBlog, readBlog, readDraft, type BlogViewer } from "../../server/blog";
import type { BlogStore } from "../../server/blog-store";

export const alice: BlogViewer = { profile: { id: 2, login: "Alice", name: "Alice Okafor", avatarUrl: "https://avatars.githubusercontent.com/u/2" }, admin: false };
export const bob: BlogViewer = { profile: { id: 3, login: "Bob", avatarUrl: "https://avatars.githubusercontent.com/u/3" }, admin: false };
export const admin: BlogViewer = { profile: { id: 1, login: "Admin", avatarUrl: "https://avatars.githubusercontent.com/u/1" }, admin: true };
export const body = [
  "## Picking an issue",
  "",
  "I looked for issues labelled **good first issue** and read the contributing guide before writing any code. The maintainers had a clear checklist, which made the first steps much less intimidating than I expected.",
  "",
  "- Run the tests locally first",
  "- Keep the change small",
  "",
  "The review asked me to rename a `helper` function and add one more test. That feedback taught me more than the code did.",
].join("\n");
export function content(overrides: Partial<BlogContentInput> = {}): BlogContentInput {
  return { title: "Shipping my first pull request", summary: "What I learned from picking a first issue and getting it reviewed.", topic: "Open source", body, canonicalUrl: null, repository: null, ...overrides };
}
export const command = (input: Record<string, unknown>) => ({ requestId: randomUUID(), ...input });
// Each helper step is a minute apart, so publication order never depends on timer resolution.
let clock = Date.parse("2026-10-01T09:00:00Z");
const tick = () => (clock += 60_000);

export async function submit(store: BlogStore, author: BlogViewer = alice, input = content(), id = randomUUID()): Promise<BlogDraft> {
  return commandBlog(store, author, command({ action: "submit", id, version: 0, content: input }), tick());
}
export async function publish(store: BlogStore, author: BlogViewer = alice, input = content()): Promise<BlogDraft> {
  const submitted = await submit(store, author, input);
  return commandBlog(store, admin, command({ action: "review", id: submitted.id, version: submitted.version, decision: "approve" }), tick());
}
const url = (query = "") => new URL(`https://opencircle.test/api/blog${query}`);

/** Behaviour every blog store must share: run against the local file store and PostgreSQL. */
export function blogContract(store: () => BlogStore) {
  it("keeps drafts and submissions private until approved, then publishes under a readable address", async () => {
    const id = randomUUID();
    const draft = await commandBlog(store(), alice, command({ action: "save", id, version: 0, content: content({ body: "Unfinished" }) }));
    expect(draft).toMatchObject({ review: "draft", published: null, slug: null, version: 1 });
    expect((await listBlog(store(), url())).total).toBe(0);
    const pending = await commandBlog(store(), alice, command({ action: "submit", id, version: draft.version, content: content() }));
    expect(pending).toMatchObject({ review: "pending", published: null });
    expect((await listBlog(store(), url())).total).toBe(0);
    expect((await queueBlog(store(), url("?queue=pending"))).items.map((post) => post.id)).toEqual([id]);
    await expect(readDraft(store(), bob, id)).rejects.toMatchObject({ status: 404 });
    const approved = await commandBlog(store(), admin, command({ action: "review", id, version: pending.version, decision: "approve" }));
    expect(approved).toMatchObject({ review: "approved", slug: "shipping-my-first-pull-request", revision: null, audit: [{ action: "submit" }, { action: "review-approve" }] });
    const read = await readBlog(store(), "shipping-my-first-pull-request");
    expect(read).toMatchObject({ title: "Shipping my first pull request", author: { login: "Alice" }, canonicalUrl: null, repository: null });
    const exposed = JSON.stringify([read, await listBlog(store(), url())]);
    for (const key of ["revision", "audit", "requests", "reviewReason", "hidden"]) expect(exposed).not.toContain(`"${key}"`);
  });

  it("keeps the approved copy live while a revision awaits review", async () => {
    const live = await publish(store());
    const revised = await commandBlog(store(), alice, command({ action: "submit", id: live.id, version: live.version, content: content({ title: "Shipping my first pull request, revisited" }) }));
    expect(revised).toMatchObject({ review: "pending", published: { title: "Shipping my first pull request" }, revision: { title: "Shipping my first pull request, revisited" } });
    expect((await readBlog(store(), live.slug!)).title).toBe("Shipping my first pull request");
    const approved = await commandBlog(store(), admin, command({ action: "review", id: live.id, version: revised.version, decision: "approve" }));
    expect(approved.slug).toBe(live.slug);
    expect(approved.editedAt).not.toBeNull();
    expect((await readBlog(store(), live.slug!)).title).toBe("Shipping my first pull request, revisited");
  });

  it("requires a reason to request changes or decline, and shows it to the author", async () => {
    const pending = await submit(store());
    await expect(commandBlog(store(), admin, command({ action: "review", id: pending.id, version: pending.version, decision: "changes" }))).rejects.toMatchObject({ status: 400, field: "reason" });
    const changes = await commandBlog(store(), admin, command({ action: "review", id: pending.id, version: pending.version, decision: "changes", reason: "Add a short example of the failing test." }));
    expect(changes).toMatchObject({ review: "changes", reviewReason: "Add a short example of the failing test." });
    const saved = await commandBlog(store(), alice, command({ action: "save", id: pending.id, version: changes.version, content: content() }));
    expect(saved).toMatchObject({ review: "changes", reviewReason: "Add a short example of the failing test." });
    const resubmitted = await commandBlog(store(), alice, command({ action: "submit", id: pending.id, version: saved.version, content: content() }));
    expect(resubmitted).toMatchObject({ review: "pending", reviewReason: "" });
    const declined = await commandBlog(store(), admin, command({ action: "review", id: pending.id, version: resubmitted.version, decision: "reject", reason: "This is a duplicate of another post." }));
    expect((await myBlog(store(), alice)).items[0]).toMatchObject({ review: "rejected", reviewReason: "This is a duplicate of another post." });
    expect(declined.audit).toBeDefined();
    expect((await myBlog(store(), alice)).items[0].audit).toBeUndefined();
  });

  it("hides, restores and features posts, and hidden posts leave every public list", async () => {
    const first = await publish(store());
    const second = await publish(store(), bob, content({ title: "Reviewing code kindly", topic: "Community" }));
    expect((await listBlog(store(), url())).items.map((post) => post.slug)).toEqual([second.slug, first.slug]);
    const featured = await commandBlog(store(), admin, command({ action: "moderate", id: first.id, version: first.version, operation: "feature" }));
    expect((await listBlog(store(), url())).items.map((post) => post.slug)).toEqual([first.slug, second.slug]);
    await expect(commandBlog(store(), admin, command({ action: "moderate", id: first.id, version: featured.version, operation: "hide" }))).rejects.toMatchObject({ status: 400, field: "reason" });
    const hidden = await commandBlog(store(), admin, command({ action: "moderate", id: first.id, version: featured.version, operation: "hide", reason: "Spam links" }));
    expect((await listBlog(store(), url())).items.map((post) => post.slug)).toEqual([second.slug]);
    await expect(readBlog(store(), first.slug!)).rejects.toMatchObject({ status: 404 });
    expect((await store().publishedPaths()).map((post) => post.slug)).toEqual([second.slug]);
    expect(await portfolioPosts(store(), alice.profile.id)).toEqual([]);
    expect((await queueBlog(store(), url("?queue=hidden"))).items.map((post) => post.id)).toEqual([first.id]);
    await commandBlog(store(), admin, command({ action: "moderate", id: first.id, version: hidden.version, operation: "restore" }));
    expect((await readBlog(store(), first.slug!)).featured).toBe(true);
    const draft = await submit(store(), bob);
    await expect(commandBlog(store(), admin, command({ action: "moderate", id: draft.id, version: draft.version, operation: "feature" }))).rejects.toMatchObject({ status: 409 });
  });

  it("lets only the author write and only admins review", async () => {
    const pending = await submit(store());
    await expect(commandBlog(store(), bob, command({ action: "save", id: pending.id, version: pending.version, content: content() }))).rejects.toMatchObject({ status: 404 });
    await expect(commandBlog(store(), alice, command({ action: "review", id: pending.id, version: pending.version, decision: "approve" }))).rejects.toMatchObject({ status: 400 });
    await expect(commandBlog(store(), admin, command({ action: "save", id: pending.id, version: pending.version, content: content() }))).rejects.toMatchObject({ status: 400 });
    expect((await readDraft(store(), admin, pending.id)).audit).toHaveLength(1);
  });

  it("rejects stale versions and replays a repeated request without applying it twice", async () => {
    const pending = await submit(store());
    const request = command({ action: "review", id: pending.id, version: pending.version, decision: "changes", reason: "Please add an example." });
    const first = await commandBlog(store(), admin, request);
    expect(await commandBlog(store(), admin, request)).toEqual(first);
    await expect(commandBlog(store(), admin, { ...request, reason: "Something else entirely." })).rejects.toMatchObject({ status: 409, code: "blog_retry" });
    await expect(commandBlog(store(), alice, command({ action: "save", id: pending.id, version: pending.version, content: content() }))).rejects.toMatchObject({ status: 409, code: "blog_conflict" });
    await expect(commandBlog(store(), alice, command({ action: "save", id: randomUUID(), version: 3, content: content() }))).rejects.toMatchObject({ status: 404 });
  });

  it("gives clashing titles distinct addresses and non-Latin titles one based on the post", async () => {
    const first = await publish(store());
    const second = await publish(store(), bob);
    expect([first.slug, second.slug]).toEqual(["shipping-my-first-pull-request", "shipping-my-first-pull-request-2"]);
    const unicode = await publish(store(), bob, content({ title: "我的第一个拉取请求" }));
    expect(unicode.slug).toBe(`post-${unicode.id.slice(0, 8)}`);
  });

  it("limits how many posts one member can have awaiting review", async () => {
    for (let index = 0; index < BLOG_PENDING_LIMIT; index++) await submit(store());
    await expect(submit(store())).rejects.toMatchObject({ status: 409, code: "blog_pending_limit" });
    await expect(submit(store(), bob)).resolves.toMatchObject({ review: "pending" });
  });

  it("enforces the pending limit across simultaneous submissions for different posts", async () => {
    for (let index = 0; index < BLOG_PENDING_LIMIT - 1; index++) await submit(store());
    const results = await Promise.allSettled([submit(store()), submit(store())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => result.reason.code)).toEqual(["blog_pending_limit"]);
    expect((await myBlog(store(), alice)).items.filter((post) => post.review === "pending")).toHaveLength(BLOG_PENDING_LIMIT);
  });

  it("enforces the draft limit across simultaneous saves for different posts", async () => {
    const save = () => commandBlog(store(), alice, command({ action: "save", id: randomUUID(), version: 0, content: content() }));
    for (let index = 0; index < BLOG_DRAFT_LIMIT - 1; index++) await save();
    const results = await Promise.allSettled([save(), save()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => result.reason.code)).toEqual(["blog_draft_limit"]);
    expect((await myBlog(store(), alice)).items).toHaveLength(BLOG_DRAFT_LIMIT);
  });

  it("filters by topic and pages results", async () => {
    for (let index = 0; index < 13; index++) await publish(store(), index % 2 ? alice : bob, content({ title: `Post number ${index + 1} about code`, topic: index % 2 ? "Career" : "Backend" }));
    const first = await listBlog(store(), url());
    expect([first.items.length, first.total, first.page]).toEqual([12, 13, 1]);
    const second = await listBlog(store(), url("?page=2"));
    expect(second.items.map((post) => post.title)).toEqual(["Post number 1 about code"]);
    expect((await listBlog(store(), url("?page=9"))).page).toBe(2);
    expect((await listBlog(store(), url("?topic=Career"))).total).toBe(6);
    await expect(listBlog(store(), url("?topic=Gardening"))).rejects.toMatchObject({ status: 400 });
    await expect(queueBlog(store(), url())).rejects.toMatchObject({ status: 400 });
  });

  it("lists an author's posts for their portfolio and leaves cross-posts out of the sitemap", async () => {
    const own = await publish(store());
    const crossPosted = await publish(store(), alice, content({ title: "Notes from my first conference talk", canonicalUrl: "https://dev.to/alice/conference-notes" }));
    expect((await readBlog(store(), crossPosted.slug!)).canonicalUrl).toBe("https://dev.to/alice/conference-notes");
    expect((await store().publishedPaths()).map((post) => post.slug)).toEqual([own.slug]);
    const posts = await portfolioPosts(store(), alice.profile.id, "https://opencircle.test");
    expect(posts.map((post) => post.url)).toEqual([`https://opencircle.test/blog/${crossPosted.slug}`, `https://opencircle.test/blog/${own.slug}`]);
    expect(await portfolioPosts(store(), bob.profile.id)).toEqual([]);
  });
}
