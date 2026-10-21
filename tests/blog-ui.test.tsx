import { forwardRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Blog from "../src/pages/Blog";
import AdminBlog from "../src/components/blog/admin-blog";
import { blogApi } from "../src/lib/blog-api";
import { defaultPortfolio } from "../shared/portfolio";
import { commandBlog, listBlog, myBlog, queueBlog, readBlog, readDraft } from "../server/blog";
import { LocalBlogStore } from "../server/blog-store";
import { MemoryPortfolioStore } from "../server/portfolio-store";
import { admin, alice, content, publish, submit } from "./helpers/blog-contract";

const state = vi.hoisted(() => ({ profile: null as null | { id: number; login: string; name?: string; avatarUrl: string } }));
vi.mock("../src/hooks/use-community", () => ({ useCommunity: () => ({ isPending: false, isError: false, data: { profile: state.profile, signInAvailable: true } }) }));
vi.mock("../src/components/account-corner", () => ({ AccountCorner: () => null }));
vi.mock("../src/components/dock", () => ({ Dock: () => null }));
// The rich editor needs a real browser; a textarea stands in with the same contract.
vi.mock("../src/components/blog/markdown-editor", () => ({
  default: forwardRef<unknown, { value: string; onChange: (value: string, normalized: boolean) => void; labelledBy: string }>(({ value, onChange, labelledBy }, _ref) =>
    <textarea aria-labelledby={labelledBy} value={value} onChange={(event) => onChange(event.target.value, false)} />),
}));
let portfolios: MemoryPortfolioStore;
vi.mock("../server/portfolio-store", async (original) => ({ ...await original<typeof import("../server/portfolio-store")>(), getPortfolioStore: () => portfolios }));

let store: LocalBlogStore;
let client: QueryClient;
function Where() { return <p data-testid="path">{useLocation().pathname}</p>; }
function mount(route: string) {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Routes>
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/mine" element={<><Blog view="mine" /><Where /></>} />
    <Route path="/blog/write" element={<Blog view="write" />} />
    <Route path="/blog/write/:id" element={<Blog view="write" />} />
    <Route path="/blog/:slug" element={<Blog view="post" />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}
const viewer = () => ({ profile: state.profile!, admin: false });
beforeEach(() => {
  state.profile = { ...alice.profile, name: alice.profile.name ?? undefined };
  store = new LocalBlogStore(null);
  portfolios = new MemoryPortfolioStore(null);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const query = (input: Record<string, string>) => new URL(`https://opencircle.test/api/blog?${new URLSearchParams(input)}`);
  vi.spyOn(blogApi, "list").mockImplementation((page, topic) => listBlog(store, query({ page: String(page), ...(topic ? { topic } : {}) })));
  vi.spyOn(blogApi, "read").mockImplementation((slug) => readBlog(store, slug));
  vi.spyOn(blogApi, "mine").mockImplementation(() => myBlog(store, viewer()));
  vi.spyOn(blogApi, "draft").mockImplementation((id) => readDraft(store, viewer(), id));
  vi.spyOn(blogApi, "command").mockImplementation((input, isAdmin) => commandBlog(store, isAdmin ? admin : viewer(), input));
  vi.spyOn(blogApi, "queue").mockImplementation((queue, page) => queueBlog(store, query({ queue, page: String(page) })));
  vi.spyOn(blogApi, "review").mockImplementation((id) => readDraft(store, admin, id));
});

it("lists published posts and links each author to their portfolio", async () => {
  vi.stubEnv("SITE_URL", "https://opencircle.test");
  await portfolios.write(alice.profile.id, "Alice", { ...defaultPortfolio({ id: 2, login: "alice", avatarUrl: "" }), displayName: "Alice Okafor" }, 0, "publish");
  const post = await publish(store);
  await submit(store);
  mount("/blog");
  const card = (await screen.findByRole("article", { name: "Shipping my first pull request" }));
  expect(within(card).getByRole("link", { name: "Shipping my first pull request" }).getAttribute("href")).toBe(`/blog/${post.slug}`);
  expect(within(card).getByRole("link", { name: "Alice Okafor's portfolio" }).getAttribute("href")).toBe("https://opencircle.test/p/alice");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Write a post" }).getAttribute("href")).toBe("/blog/write");
  vi.unstubAllEnvs();
});

it("offers sign-in to readers who want to write", async () => {
  state.profile = null;
  mount("/blog");
  expect((await screen.findByRole("link", { name: "Sign in to write" })).getAttribute("href")).toBe("/api/auth-start?returnTo=%2Fblog%2Fwrite");
  mount("/blog/write");
  expect((await screen.findAllByRole("link", { name: "Sign in with GitHub" }))[0].getAttribute("href")).toBe("/api/auth-start?returnTo=%2Fblog%2Fwrite");
});

it("shows a post with its embeds, original address, repository and author", async () => {
  const post = await publish(store, undefined, content({
    body: `${content().body}\n\n<https://youtu.be/dQw4w9WgXcQ?t=42>\n\n[The helper](https://gist.github.com/octocat/6cad326836d38bd3a7ae)\n\nA link mid-sentence to https://youtu.be/dQw4w9WgXcQ stays a link.`,
    canonicalUrl: "https://dev.to/alice/first-pr",
  }));
  await store.transact(post.id, true, (box) => { box.post!.published!.repository = { provider: "github", fullName: "opencirclehq/open-circle", url: "https://github.com/opencirclehq/open-circle" }; });
  mount(`/blog/${post.slug}`);
  expect(await screen.findByRole("heading", { level: 1, name: "Shipping my first pull request" })).toBeTruthy();
  const video = screen.getByTitle("YouTube video") as HTMLIFrameElement;
  expect(video.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42");
  const gist = screen.getByTitle("The helper") as HTMLIFrameElement;
  expect(gist.getAttribute("sandbox")).toBe("allow-scripts allow-popups allow-popups-to-escape-sandbox");
  expect(gist.getAttribute("srcdoc")).toContain('src="https://gist.github.com/octocat/6cad326836d38bd3a7ae.js"');
  expect(document.querySelectorAll("iframe")).toHaveLength(2);
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { gistHeight: 480 }, source: window })); });
  expect(gist.style.height).toBe("");
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { gistHeight: 480 }, source: gist.contentWindow })); });
  expect(gist.style.height).toBe("480px");
  expect(screen.getByRole("link", { name: /dev\.to/ }).getAttribute("href")).toBe("https://dev.to/alice/first-pr");
  expect(screen.getByRole("link", { name: /opencirclehq\/open-circle/ }).getAttribute("href")).toBe("https://github.com/opencirclehq/open-circle");
  const author = screen.getByRole("region", { name: "Alice Okafor" });
  expect(within(author).queryByRole("link", { name: "View portfolio" })).toBeNull();
  expect(within(author).getByRole("link", { name: /GitHub/ }).getAttribute("href")).toBe("https://github.com/Alice");
  await waitFor(() => expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://dev.to/alice/first-pr"));
});

it("makes the author choose a topic, refuses raw HTML, then submits for review", async () => {
  const user = userEvent.setup();
  mount("/blog/write");
  await user.type(await screen.findByLabelText("Title"), "Writing the failing test first");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Choose a topic for your post.");
  expect(blogApi.command).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox", { name: "Topic" }).textContent).toContain("Choose a topic");
  await user.click(screen.getByRole("combobox", { name: "Topic" }));
  await user.click(await screen.findByRole("option", { name: "Tutorials" }));
  await user.type(screen.getByLabelText("Summary"), "How writing a failing test first changed the way I fix bugs.");
  const editor = screen.getByLabelText("Post");
  await user.click(editor);
  await user.paste(`${content().body}\n\n<div>raw</div>`);
  expect(await screen.findByText(/raw HTML/, { selector: "p[role=status]" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Submit for review" }));
  expect(blogApi.command).not.toHaveBeenCalled();
  await user.clear(editor);
  await user.click(editor);
  await user.paste(content().body);
  await user.type(screen.getByLabelText(/Related repository/), "https://github.com/opencirclehq");
  await user.click(screen.getByRole("button", { name: "Submit for review" }));
  expect((await screen.findAllByRole("alert")).at(-1)?.textContent).toMatch(/public repository address/);
  await user.clear(screen.getByLabelText(/Related repository/));
  await user.click(screen.getByRole("button", { name: "Submit for review" }));
  expect((await screen.findByTestId("path")).textContent).toBe("/blog/mine");
  expect(vi.mocked(blogApi.command).mock.calls[0][0]).toMatchObject({ action: "submit", version: 0, content: { topic: "Tutorials", canonicalUrl: null, repository: null } });
  expect(await screen.findByText("Awaiting approval")).toBeTruthy();
});

it("shows the reviewer's note and lets the author revise a requested change", async () => {
  const pending = await submit(store);
  await commandBlog(store, admin, { requestId: crypto.randomUUID(), action: "review", id: pending.id, version: pending.version, decision: "changes", reason: "Add a short code example." });
  const user = userEvent.setup();
  mount("/blog/mine");
  expect(await screen.findByText("Add a short code example.")).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Edit" }));
  expect(await screen.findByText("Changes requested")).toBeTruthy();
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Shipping my first pull request");
  await user.click(screen.getByRole("button", { name: "Submit for review" }));
  expect((await screen.findByTestId("path")).textContent).toBe("/blog/mine");
  expect((await readDraft(store, admin, pending.id)).review).toBe("pending");
});

it("lets admins require a reason, request changes and publish from the review queue", async () => {
  const pending = await submit(store);
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><MemoryRouter><AdminBlog profile={admin.profile} onUnauthorized={vi.fn()} /></MemoryRouter></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Shipping my first pull request" }));
  await user.click(await screen.findByRole("button", { name: "Request changes" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/reason for the author/);
  await user.type(screen.getByLabelText("Note to the author"), "Add a short code example.");
  await user.click(screen.getByRole("button", { name: "Request changes" }));
  await waitFor(async () => expect((await readDraft(store, admin, pending.id)).review).toBe("changes"));
  await commandBlog(store, alice, { requestId: crypto.randomUUID(), action: "submit", id: pending.id, version: (await readDraft(store, admin, pending.id)).version, content: content() });
  await client.invalidateQueries();
  await user.click(await screen.findByRole("button", { name: "Approve and publish" }));
  await waitFor(async () => expect((await readDraft(store, admin, pending.id)).review).toBe("approved"));
  expect(await screen.findByRole("link", { name: /View the live post/ })).toBeTruthy();
  expect(screen.getByText(/review approve by @Admin/)).toBeTruthy();
});
