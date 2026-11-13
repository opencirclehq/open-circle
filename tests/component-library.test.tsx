import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import Components from "../src/pages/Components";
import { submissionUrl } from "../src/components/library/submit-dialog";
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

  it("turns a submission into a labelled GitHub issue", () => {
    const url = new URL(submissionUrl({ name: "Glass Tabs", link: "https://github.com/a/b", description: "Tabs with glass." }));
    expect(url.pathname).toMatch(/\/issues\/new$/);
    expect(url.searchParams.get("title")).toBe("Component: Glass Tabs");
    expect(url.searchParams.get("labels")).toBe("component");
    expect(url.searchParams.get("body")).toContain("https://github.com/a/b");
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

  it("checks a submission before sending it to GitHub", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mount("/components");
    await user.click(screen.getByRole("button", { name: "Submit a component" }));
    await user.type(screen.getByLabelText("Component name"), "Glass Tabs");
    await user.type(screen.getByLabelText("Link to the code"), "not a link");
    await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
    expect(toast.error).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Link to the code"));
    await user.type(screen.getByLabelText("Link to the code"), "https://github.com/a/b");
    await user.click(screen.getByRole("button", { name: "Continue on GitHub" }));
    expect(open).toHaveBeenCalledOnce();
    expect(String(open.mock.calls[0][0])).toContain("labels=component");
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
