import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PortfolioView } from "../src/components/portfolio/portfolio-view";
import { PortfolioEditor } from "../src/pages/Portfolio";
import { defaultPortfolio, type PortfolioEditorState, type PublicPortfolio } from "../shared/portfolio";
import { COMMUNITY_KEY } from "../src/hooks/use-community";

const profile = { id: 42, login: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/42" };
function initial(): PortfolioEditorState { return { profile, posts: [], draft: { ...defaultPortfolio(profile), displayName: "Alice Chen" }, version: 0, publishedAt: null, updatedAt: null, uploadsAvailable: false, subdomainsAvailable: false }; }
function mount(state = initial()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  // The editor's avatar menu reads the signed-in account; seed it so the only
  // requests these tests see are the portfolio's own.
  client.setQueryData(COMMUNITY_KEY, { tools: [], counts: {}, voted: [], toolVotes: {}, signInAvailable: true, profile });
  return render(<MemoryRouter><QueryClientProvider client={client}><PortfolioEditor initial={state} /></QueryClientProvider></MemoryRouter>);
}

it("previews actual content and customization, then saves the chosen design", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ...initial(), draft: body.content, version: 1, updatedAt: Date.now() }));
  });
  vi.stubGlobal("fetch", fetcher);
  const { container } = mount();
  await user.clear(screen.getByLabelText("Name", { exact: true })); await user.type(screen.getByLabelText("Name", { exact: true }), "Alice Builds");
  expect(screen.getByRole("heading", { name: "Alice Builds" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Style" }));
  await user.click(screen.getByRole("button", { name: "Daylight" })); await user.click(screen.getByRole("button", { name: "Mint" })); await user.click(screen.getByRole("button", { name: "Contour" }));
  expect(container.querySelector(".pf-light .pf-cover-contour")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Mint" }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Mobile preview" }));
  expect(container.querySelector('.studio-preview-frame[data-device="mobile"]')).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body).toMatchObject({ action: "save", version: 0, content: { displayName: "Alice Builds", theme: "light", accent: "mint", coverStyle: "contour" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" }).hasAttribute("disabled")).toBe(true));
  await user.click(screen.getByRole("tab", { name: "Profile" }));
  expect((screen.getByLabelText("Your address") as HTMLInputElement).disabled).toBe(true);
});

it("keeps contacts private until switched on and makes hiring a deliberate choice", async () => {
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole("tab", { name: "Contact" }));
  await user.type(screen.getByLabelText("Email", { exact: true }), "alice@example.com");
  expect(screen.queryByRole("link", { name: "Email" })).toBeNull(); expect(screen.queryByRole("link", { name: "Hire me" })).toBeNull();
  await user.click(screen.getByRole("switch", { name: "Show Email publicly" }));
  expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe("mailto:alice@example.com");
  await user.click(screen.getByRole("combobox", { name: "Availability" })); await user.click(screen.getByRole("option", { name: "Available for work" }));
  await user.click(screen.getByRole("combobox", { name: "Hire me button" })); await user.click(screen.getByRole("option", { name: "Contact me by Email" }));
  expect(screen.getByRole("link", { name: "Hire me" }).getAttribute("href")).toBe("mailto:alice@example.com");
  await user.click(screen.getByRole("switch", { name: "Show Email publicly" }));
  expect(screen.queryByRole("link", { name: "Hire me" })).toBeNull(); expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
});

it("saves skills separated by commas, semicolons or pasted lines without treating the list as one skill", async () => {
  const user = userEvent.setup();
  const skills = ["Continuous integration and deployment", "React", "Product design", "C/C++"];
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ ...initial(), draft: JSON.parse(String(init?.body)).content, version: 1, updatedAt: Date.now() })));
  vi.stubGlobal("fetch", fetcher); mount();
  const input = screen.getByRole("textbox", { name: "Skills" });
  await user.click(input);
  await user.paste(`${skills[0]}, React; Product design\nC/C++`);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ action: "save", content: { skills } });
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Skills" }) as HTMLTextAreaElement).value).toBe(skills.join(", ")));
});

it("keeps all twelve maximum-length skills without truncating the list", async () => {
  const user = userEvent.setup();
  const skills = Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(80, "x"));
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ ...initial(), draft: JSON.parse(String(init?.body)).content, version: 1, updatedAt: Date.now() })));
  vi.stubGlobal("fetch", fetcher); mount();
  await user.click(screen.getByRole("textbox", { name: "Skills" }));
  await user.paste(skills.join(", "));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).content.skills).toEqual(skills);
});

it.each(["Save draft", "Publish"])("returns to Skills after %s fails and lets the member correct it", async (action) => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ ...initial(), draft: JSON.parse(String(init?.body)).content, version: 1, updatedAt: Date.now() })));
  vi.stubGlobal("fetch", fetcher); mount();
  await user.type(screen.getByRole("textbox", { name: "Skills" }), "x".repeat(81));
  await user.click(screen.getByRole("tab", { name: "Style" }));
  await user.click(screen.getByRole("button", { name: action }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  const input = screen.getByRole("textbox", { name: "Skills" }) as HTMLTextAreaElement;
  expect(input.value).toBe("x".repeat(81));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("alert").textContent).toContain("Separate different skills");
  await user.clear(input); await user.type(input, "Continuous integration and deployment, React");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  await user.click(screen.getByRole("button", { name: action }));
  if (action === "Publish") await user.click(screen.getByRole("button", { name: "Publish portfolio" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ action: action === "Publish" ? "publish" : "save", content: { skills: ["Continuous integration and deployment", "React"] } });
});

it.each(["Save draft", "Publish"])("returns to Skills for a server validation error after %s and preserves the draft for retry", async (action) => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "portfolio_invalid", field: "skills", message: "Check your skills and try again." } }), { status: 400 }));
  vi.stubGlobal("fetch", fetcher); mount();
  await user.type(screen.getByRole("textbox", { name: "Skills" }), "React, TypeScript");
  await user.click(screen.getByRole("tab", { name: "Style" }));
  await user.click(screen.getByRole("button", { name: action }));
  if (action === "Publish") await user.click(screen.getByRole("button", { name: "Publish portfolio" }));
  const input = await screen.findByRole("textbox", { name: "Skills" }) as HTMLTextAreaElement;
  expect(input.value).toBe("React, TypeScript");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("alert").textContent).toBe("Check your skills and try again.");
  await user.type(input, ", Product design");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...initial(), draft: { ...initial().draft, skills: ["React", "TypeScript", "Product design"] }, version: 1, updatedAt: Date.now() })));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({ action: "save", version: 0, content: { skills: ["React", "TypeScript", "Product design"] } });
});

it("shows only selected repositories, preserves their order and confirms publication", async () => {
  const user = userEvent.setup();
  const state = initial();
  state.draft.projects = [1, 2].map((id) => ({ repository: { id, name: `Project ${id}`, fullName: `Alice/project-${id}`, description: "Something useful.", language: "TypeScript", stars: 1, forks: 0, url: `https://github.com/Alice/project-${id}`, homepage: "" }, title: "", summary: "", imageUrl: "" }));
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ ...state, draft: JSON.parse(String(init?.body)).content, version: 1, publishedAt: Date.now(), updatedAt: Date.now() })));
  vi.stubGlobal("fetch", fetcher); mount(state);
  await user.click(screen.getByRole("tab", { name: "Projects" }));
  await user.click(screen.getByRole("button", { name: "Move Project 1 down" }));
  const projects = screen.getAllByRole("heading", { level: 3 }).filter((heading) => heading.textContent?.startsWith("Project"));
  expect(projects.map((project) => project.textContent)).toEqual(["Project 2", "Project 1"]);
  await user.click(screen.getByRole("button", { name: "Remove Project 2" }));
  expect(screen.queryByRole("heading", { name: "Project 2" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Publish" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").textContent).toContain("alice.opencircle.cc");
  await user.click(screen.getByRole("button", { name: "Publish portfolio" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ action: "publish", content: { projects: [{ repository: { id: 1 } }] } });
});

it("renders Markdown without active HTML or unsafe links and hides private contacts", () => {
  const portfolio: PublicPortfolio = { ...initial().draft, githubLogin: "Alice", avatarUrl: profile.avatarUrl, publishedAt: 1, readme: "## My work\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n[Source](https://github.com/Alice)\n\n- Useful thing\n\n```ts\nconst useful = true\n```", contacts: [{ kind: "whatsapp", value: "+2348031234567", visible: false }] };
  const { container } = render(<PortfolioView portfolio={portfolio} />);
  expect(container.querySelector("script")).toBeNull(); expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Source" }).getAttribute("rel")).toBe("noopener noreferrer");
  expect(container.textContent).not.toContain("2348031234567"); expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  expect(container.querySelector("pre code")?.textContent).toContain("const useful = true");
});

it("accepts a newer saved draft when untouched and preserves changes already being edited", async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const state = { ...initial(), version: 1 };
  const page = (next: PortfolioEditorState) => <MemoryRouter><QueryClientProvider client={client}><PortfolioEditor initial={next} /></QueryClientProvider></MemoryRouter>;
  const view = render(page(state));
  view.rerender(page({ ...state, version: 2, draft: { ...state.draft, displayName: "New saved name", skills: ["Rust", "TypeScript"] } }));
  await waitFor(() => expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("New saved name"));
  expect((screen.getByRole("textbox", { name: "Skills" }) as HTMLInputElement).value).toBe("Rust, TypeScript");
  await user.clear(screen.getByLabelText("Name")); await user.type(screen.getByLabelText("Name"), "My unsaved edit");
  view.rerender(page({ ...state, version: 3, draft: { ...state.draft, displayName: "Another saved name" } }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("My unsaved edit");
});

it.each([
  ["Group participation", "button", "/participation", "Participation page"],
  ["OpenCircle home", "link", "/", "Community board"],
] as const)("asks before %s leaves unsaved changes, and leaves only when confirmed", async (action, role, destination, page) => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(COMMUNITY_KEY, { tools: [], counts: {}, voted: [], toolVotes: {}, signInAvailable: true, profile });
  render(<MemoryRouter initialEntries={["/portfolio"]}><QueryClientProvider client={client}><Routes>
    <Route path="/portfolio" element={<PortfolioEditor initial={initial()} />} />
    <Route path={destination} element={<p>{page}</p>} />
  </Routes></QueryClientProvider></MemoryRouter>);
  await user.type(screen.getByLabelText("Name", { exact: true }), " Jr");
  await user.click(screen.getByRole(role, { name: action }));
  expect(screen.getByRole("dialog").textContent).toContain("Leave your unsaved changes?");
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Name", { exact: true })).toBeTruthy();
  expect(screen.queryByText(page)).toBeNull();
  await user.click(screen.getByRole(role, { name: action }));
  await user.click(screen.getByRole("button", { name: "Leave page" }));
  expect(await screen.findByText(page)).toBeTruthy();
});
