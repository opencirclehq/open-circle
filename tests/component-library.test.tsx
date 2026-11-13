import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Components from "../src/pages/Components";
import { ComponentReview } from "../src/components/admin/component-review";
import { highlightLines, tokenize } from "../src/components/library/highlight";
import { api } from "../src/lib/api";
import { parseComponentSubmission, submissionMarkdown, type ComponentSubmission } from "../shared/components";
import { findItem, itemMarkdown, LIBRARY, searchLibrary } from "../src/library/registry";
import { COMMUNITY_KEY } from "../src/hooks/use-community";

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no canvas; the ASCII light skips drawing when there's no context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(COMMUNITY_KEY, { tools: [], counts: {}, voted: [], toolVotes: {}, signInAvailable: false, profile: null });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/components" element={<Components />} />
          <Route path="/components/:slug" element={<Components />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("component library data", () => {
  it("searches names, tags and categories", () => {
    expect(searchLibrary("").length).toBe(LIBRARY.length);
    expect(searchLibrary("folder").map((item) => item.slug)).toEqual(["icon-folder"]);
    expect(searchLibrary("ASCII").map((item) => item.slug)).toEqual(["split-footer"]);
    expect(searchLibrary("nothing-like-this")).toEqual([]);
  });

  it("builds paste-ready Markdown with usage and the full source", () => {
    const footer = findItem("split-footer")!;
    const markdown = itemMarkdown(footer);
    expect(markdown.startsWith("# Split Footer\n")).toBe(true);
    expect(markdown).toContain("## Usage");
    expect(markdown).toContain("```tsx\n" + footer.usage);
    expect(markdown).toContain(footer.source.trimEnd());
    expect(footer.source).toContain("export function SplitFooter");
  });

  it("validates a submission: code, category, tags and packages", () => {
    const source = "export function GlassTabs() {\n  return <div />;\n}";
    const valid = { name: "  Glass   Tabs ", category: "Navigation", tags: "Tabs, glass", dependencies: "motion react", link: "https://github.com/a/b#readme", source: `${source}\r\n`, usage: " <GlassTabs /> " };
    expect(parseComponentSubmission(valid)).toEqual({ ok: true, value: { name: "Glass Tabs", category: "Navigation", tags: ["tabs", "glass"], dependencies: ["motion"], link: "https://github.com/a/b", source, usage: "<GlassTabs />" } });
    expect(parseComponentSubmission({ ...valid, link: "" })).toMatchObject({ ok: true, value: { link: "" } });
    expect(parseComponentSubmission({ ...valid, name: "G" })).toMatchObject({ ok: false, field: "name" });
    expect(parseComponentSubmission({ ...valid, category: "" })).toMatchObject({ ok: false, field: "category" });
    expect(parseComponentSubmission({ ...valid, tags: "a, b, c, d, e, f" })).toMatchObject({ ok: false, field: "tags" });
    expect(parseComponentSubmission({ ...valid, source: "  " })).toMatchObject({ ok: false, field: "source" });
    expect(parseComponentSubmission({ ...valid, dependencies: "Not/A Package!" })).toMatchObject({ ok: false, field: "dependencies" });
    for (const link of ["http://github.com/a", "javascript:alert(1)", "https://user:pw@github.com/a", "https://localhost/a"])
      expect(parseComponentSubmission({ ...valid, link })).toMatchObject({ ok: false, field: "link" });
  });

  it("builds review Markdown from a submission", () => {
    const markdown = submissionMarkdown({ id: "x", slug: "glass-tabs", name: "Glass Tabs", category: "Navigation", tags: ["tabs"], dependencies: [], link: "", source: "export const A = 1;", usage: "<A />", status: "pending", createdAt: 0, submitter: { login: "maker", avatarUrl: "" } });
    expect(markdown).toContain("## Source (`glass-tabs.tsx`)");
    expect(markdown).toContain("```tsx\n<A />\n```");
    expect(markdown).toContain("_Submitted by @maker._");
  });

  it("colours TSX source without losing any of it", () => {
    const code = `// hi\nexport const Card = () => <div className="p-2">{count + 1}</div>;\nconst t = \`a\nb\`;`;
    expect(tokenize(code).map((token) => token.text).join("")).toBe(code);
    const kinds = Object.fromEntries(tokenize(code).map((token) => [token.text, token.kind]));
    expect(kinds).toMatchObject({ "// hi": "comment", export: "keyword", Card: "type", div: "tag", className: "attr", '"p-2"': "string", "1": "number" });
    const lines = highlightLines(code);
    expect(lines).toHaveLength(4);
    expect(lines[3][0]).toEqual({ kind: "string", text: "b`" });
    expect(highlightLines(LIBRARY[0].source).map((line) => line.map((token) => token.text).join("")).join("\n")).toBe(LIBRARY[0].source);
  });
});

describe("component library page", () => {
  it("lists components with empty placeholder cards and filters by search", async () => {
    const user = userEvent.setup();
    mount("/components");
    const grid = screen.getByRole("list", { name: "Components" });
    expect(within(grid).getByRole("link", { name: /^Split Footer/ }).getAttribute("href")).toBe("/components/split-footer");
    expect(within(grid).getByRole("link", { name: /^Icon Folder/ })).toBeTruthy();
    expect(within(grid).getByRole("button", { name: /Submit yours/ })).toBeTruthy();
    await user.type(screen.getByRole("searchbox", { name: "Search components" }), "folder");
    await waitFor(() => expect(within(grid).queryByRole("link", { name: /^Split Footer/ })).toBeNull());
    expect(within(grid).queryByRole("button", { name: /Submit yours/ })).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Search components" }));
    await user.type(screen.getByRole("searchbox", { name: "Search components" }), "zzz");
    expect(await screen.findByText("No components match")).toBeTruthy();
  });

  it("checks a submission before sending it for review", async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(api, "submitComponent").mockResolvedValue({ id: "x", status: "pending" });
    mount("/components");
    await user.click(screen.getByRole("button", { name: "Submit a component" }));
    await user.type(screen.getByLabelText("Component name"), "Glass Tabs");
    await user.click(screen.getByRole("button", { name: "Send for review" }));
    expect(toast.error).toHaveBeenCalledWith("Choose a category.");
    expect(submit).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("radiogroup", { name: "Category" })).getByRole("radio", { name: "Navigation" }));
    await user.type(screen.getByLabelText("Tags"), "tabs, glass");
    await user.click(screen.getByRole("button", { name: "Send for review" }));
    expect(toast.error).toHaveBeenCalledWith("Paste the component's code.");
    expect(submit).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("Component code"));
    await user.paste("export function GlassTabs() {\n  return null;\n}");
    await user.click(screen.getByRole("button", { name: "Usage" }));
    await user.click(screen.getByLabelText("Usage example"));
    await user.paste("<GlassTabs />");
    await user.click(screen.getByRole("button", { name: "Send for review" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toEqual({ name: "Glass Tabs", category: "Navigation", tags: ["tabs", "glass"], dependencies: [], link: "", source: "export function GlassTabs() {\n  return null;\n}", usage: "<GlassTabs />" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sent for review. Thanks for sharing."));
  });

  it("never nests the demo's links inside the card link", () => {
    mount("/components");
    for (const link of screen.getByRole("list", { name: "Components" }).querySelectorAll("a[href^='/components/']"))
      expect(link.querySelector("a")).toBeNull();
  });

  it("previews a component, copies its code or Markdown and switches to the source", async () => {
    const user = userEvent.setup();
    const footer = findItem("split-footer")!;
    mount("/components/split-footer");
    expect(screen.getByRole("heading", { level: 1, name: "Split Footer" })).toBeTruthy();
    expect(screen.getByTestId("preview-stage")).toBeTruthy();
    const nav = screen.getByRole("complementary", { name: "Components" });
    expect(within(nav).getByRole("link", { name: /Split Footer/ }).getAttribute("aria-current")).toBe("page");

    // userEvent provides the clipboard; read back exactly what was copied.
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await navigator.clipboard.readText()).toBe(footer.source);
    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(await navigator.clipboard.readText()).toBe(itemMarkdown(footer));

    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(screen.getByLabelText("split-footer.tsx").textContent).toContain("export function SplitFooter");
    await user.click(within(nav).getByRole("link", { name: /Icon Folder/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Icon Folder" })).toBeTruthy();
  });

  it("explains a missing component", () => {
    mount("/components/does-not-exist");
    expect(screen.getByText("This component isn't here")).toBeTruthy();
  });
});

describe("component review (admin)", () => {
  const submission = (patch: Partial<ComponentSubmission> = {}): ComponentSubmission => ({
    id: "11111111-1111-4111-8111-111111111111", slug: "glass-tabs", name: "Glass Tabs", category: "Navigation", tags: ["tabs"], dependencies: [], link: "",
    source: "export function GlassTabs() {\n  return null;\n}", usage: "",
    status: "pending", createdAt: Date.now() - 60_000, submitter: { login: "octocat", avatarUrl: "" }, ...patch,
  });

  function mountReview() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ComponentReview /></QueryClientProvider>);
  }

  it("lists pending submissions and accepts one", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "adminComponents").mockResolvedValue([submission(), submission({ id: "22222222-2222-4222-8222-222222222222", slug: "old-card", name: "Old Card", status: "declined", reviewer: "admin" })]);
    const review = vi.spyOn(api, "reviewComponent").mockResolvedValue(submission({ status: "accepted" }));
    mountReview();
    const list = await screen.findByRole("list", { name: "Component submissions" });
    expect(within(list).getByText("Glass Tabs")).toBeTruthy();
    expect(within(list).queryByText("Old Card")).toBeNull();
    expect(screen.getByText("1 pending · 0 accepted · 1 declined")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "View code for Glass Tabs" }));
    expect(screen.getByLabelText("glass-tabs.tsx").textContent).toContain("export function GlassTabs");
    await user.click(screen.getByRole("button", { name: "Accept Glass Tabs" }));
    await waitFor(() => expect(review).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "accepted"));
  });
});
