import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePageMeta } from "../src/hooks/use-page-meta";
import type { ForumSharePreview } from "../shared/forum-seo";

const first = "87385d88-dbbd-4517-a851-7d777c8ae770";
const second = "b7cd3dc5-6225-4ddd-95b1-28f0bdbbe031";
const preview: ForumSharePreview = { id: first, title: "What is the difference between Git and GitHub?", description: "How local commits work with a remote repository.", author: "@Alice", category: "Git / GitHub", kind: "question", version: "1234567890abcdef" };
const meta = (key: string) => document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute("content");
let previousHead: string;

function Page() {
  usePageMeta();
  return <><Link to={`/community/${second}`}>Another question</Link><Link to="/community">Community</Link><Link to="/tools">Tools</Link></>;
}
function mount(pathname = `/community/${first}`) {
  return render(<MemoryRouter initialEntries={[pathname]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Page /></MemoryRouter>);
}
beforeEach(() => {
  previousHead = document.head.innerHTML;
  document.head.innerHTML = '<title>Community · OpenCircle</title><link rel="canonical" href="https://opencircle.cc/community">';
});
afterEach(() => { document.head.innerHTML = previousHead; });

it("uses the published public preview for client navigation and resets the image when leaving the post", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(preview));
  vi.stubGlobal("fetch", fetcher);
  mount();
  await waitFor(() => expect(meta("og:title")).toBe(`${preview.title} · OpenCircle`));
  expect(document.title).toBe(meta("og:title"));
  expect(meta("og:description")).toBe(preview.description);
  expect(meta("twitter:description")).toBe(preview.description);
  expect(meta("og:url")).toBe(`https://opencircle.cc/community/${first}`);
  expect(meta("og:image")).toContain(`/api/forum-image?id=${first}&v=${preview.version}`);
  expect(meta("twitter:image")).toBe(meta("og:image"));
  expect(fetcher).toHaveBeenCalledWith(`/api/forum-preview?id=${first}`, expect.objectContaining({ credentials: "omit", cache: "no-store", signal: expect.any(AbortSignal) }));
  await userEvent.setup().click(screen.getByRole("link", { name: "Tools" }));
  expect(document.title).toBe("Developer tools · OpenCircle");
  expect(meta("og:image")).toMatch(/^https:\/\/opencircle\.cc\/api\/page-image\?path=%2Ftools&v=/);
  expect(meta("twitter:image")).toBe(meta("og:image"));
});

it("preserves server-rendered thread metadata while fetching and ignores a late response after navigation", async () => {
  document.head.innerHTML = `<title>${preview.title} · OpenCircle</title><link rel="canonical" href="https://opencircle.cc/community/${first}"><meta property="og:image" content="https://opencircle.cc/api/forum-image?id=${first}">`;
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })));
  mount();
  expect(document.title).toBe(`${preview.title} · OpenCircle`);
  await userEvent.setup().click(screen.getByRole("link", { name: "Community" }));
  await act(async () => { finish(Response.json(preview)); });
  expect(document.title).toBe("Community · OpenCircle");
  expect(meta("og:image")).toBe("https://opencircle.cc/api/home-image");
});

it("preserves existing event titles and covers when the event page loads", () => {
  document.head.innerHTML = '<title>OpenCircle workshop</title><link rel="canonical" href="https://opencircle.cc/events/yu48r"><meta property="og:image" content="https://opencircle.cc/api/event-cover?slug=yu48r&amp;asset=poster">';
  mount("/events/yu48r");
  expect(document.title).toBe("OpenCircle workshop");
  expect(meta("og:image")).toBe("https://opencircle.cc/api/event-cover?slug=yu48r&asset=poster");
  expect(fetch).not.toHaveBeenCalled();
});

it("switches between thread metadata without keeping the previous thread image or accepting a stale response", async () => {
  let finishFirst!: (value: Response) => void;
  const another = { ...preview, id: second, title: "How do pull requests work?", kind: "discussion" };
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => url.includes(first) ? new Promise<Response>(resolve => { finishFirst = resolve; }) : Promise.resolve(Response.json(another))));
  mount();
  await userEvent.setup().click(screen.getByRole("link", { name: "Another question" }));
  await waitFor(() => expect(document.title).toBe(`${another.title} · OpenCircle`));
  await act(async () => { finishFirst(Response.json(preview)); });
  expect(document.title).toBe(`${another.title} · OpenCircle`);
  expect(meta("og:image")).toContain(`id=${second}`);
});
