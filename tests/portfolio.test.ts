import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPortfolio, portfolioHostname, portfolioSlugFromHostname, publicPortfolio } from "../shared/portfolio";
import { parsePortfolio, safePortfolioUrl } from "../shared/portfolio-validation";
import { MemoryPortfolioStore } from "../server/portfolio-store";
import { validatePortfolioImage } from "../server/portfolio-upload";
import { portfolioHtml, publicPortfolioSlug } from "../server/portfolio-html";

const profile = { id: 42, login: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/42" };
const content = () => ({ ...defaultPortfolio(profile), displayName: "Alice Chen", bio: "Building useful things." });
const directories: string[] = [];
afterEach(() => { directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })); });

describe("portfolio addresses and input", () => {
  it("routes only single-level member subdomains and preserves infrastructure hosts", () => {
    expect(portfolioHostname("alice")).toBe("alice.opencircle.cc");
    expect(portfolioSlugFromHostname("Alice.OpenCircle.cc.")).toBe("alice");
    for (const host of ["opencircle.cc", "www.opencircle.cc", "wa.opencircle.cc", "api.opencircle.cc", "alice.name.opencircle.cc", "alice.opencircle.cc.evil.test", "-alice.opencircle.cc"]) expect(portfolioSlugFromHostname(host)).toBeNull();
  });
  it("keeps explicit customization and locks a saved address", () => {
    const input = { ...content(), theme: "light", accent: "mint", coverStyle: "contour", coverPosition: 82, skills: ["React", "TypeScript", "React"] };
    expect(parsePortfolio(input)).toMatchObject({ theme: "light", accent: "mint", coverStyle: "contour", coverPosition: 82, skills: ["React", "TypeScript"] });
    expect(() => parsePortfolio({ ...input, slug: "bob" }, "alice")).toThrow("cannot be changed");
    for (const slug of ["www", "wa", "admin", "api", "a.b", "-alice", "alice-", "x".repeat(40)]) expect(() => parsePortfolio({ ...input, slug })).toThrow();
    expect(parsePortfolio({ ...input, slug: "a" }).slug).toBe("a");
  });
  it("accepts descriptive skill names and trims before checking their length", () => {
    const skills = ["Continuous integration and deployment", "x".repeat(80)];
    expect(parsePortfolio({ ...content(), skills: skills.map((skill) => ` ${skill} `) }).skills).toEqual(skills);
    expect(parsePortfolio({ ...content(), skills: Array.from({ length: 12 }, (_, index) => `Skill ${index}`) }).skills).toHaveLength(12);
  });
  it.each([
    ["an overlong skill", ["x".repeat(81)]],
    ["too many skills", Array.from({ length: 13 }, (_, index) => `Skill ${index}`)],
    ["an empty skill", [" "]],
    ["a non-text skill", [42]],
  ])("identifies the Skills field for %s", (_label, skills) => {
    expect(() => parsePortfolio({ ...content(), skills })).toThrow(expect.objectContaining({ field: "skills" }));
  });
  it("rejects executable and credential-bearing links, unknown fields and overlong content", () => {
    for (const url of ["javascript:alert(1)", "data:image/svg+xml,svg", "http://example.com", "https://user:password@example.com", "https://127.0.0.1", "https://localhost", "https://example.com:8443"]) expect(() => safePortfolioUrl(url)).toThrow();
    expect(safePortfolioUrl("https://example.com/work")).toBe("https://example.com/work");
    expect(() => parsePortfolio({ ...content(), readme: "x".repeat(20_001) })).toThrow();
    expect(() => parsePortfolio({ ...content(), theme: "system" })).toThrow();
    expect(parsePortfolio({ ...content(), ownerId: 9, published: true })).not.toHaveProperty("ownerId");
  });
  it("requires intentional public contacts and a valid hire destination", () => {
    const contacts = [{ kind: "email", value: "alice@example.com", visible: false }, { kind: "whatsapp", value: "+234 803 123 4567", visible: true }];
    expect(parsePortfolio({ ...content(), contacts, primaryContact: "whatsapp" }).contacts[1].value).toBe("+2348031234567");
    expect(() => parsePortfolio({ ...content(), contacts, primaryContact: "email" })).toThrow("visible contact");
    expect(() => parsePortfolio({ ...content(), contacts: [{ kind: "email", value: "alice@example.com?bcc=evil@example.com", visible: true }] })).toThrow();
    expect(() => parsePortfolio({ ...content(), contacts: [{ kind: "linkedin", value: "https://linkedin.com.evil.test/alice", visible: true }] })).toThrow();
    expect(() => parsePortfolio({ ...content(), contacts: [contacts[0], contacts[0]] })).toThrow("once");
  });
});

describe("draft and published persistence", () => {
  it("isolates private drafts and contacts, updates only on publish, and unpublishes immediately", async () => {
    const store = new MemoryPortfolioStore(null);
    const draft = { ...content(), contacts: [{ kind: "whatsapp" as const, value: "+2348031234567", visible: false }] };
    const first = await store.write(42, "Alice", draft, 0, "save");
    expect(publicPortfolio(first)).toBeNull();
    const published = await store.write(42, "Alice", draft, 1, "publish");
    const exposed = publicPortfolio(published)!;
    expect(exposed.displayName).toBe("Alice Chen");
    expect(JSON.stringify(exposed)).not.toContain("2348031234567");
    expect(exposed).not.toHaveProperty("ownerId");
    const changed = await store.write(42, "Alice", { ...draft, displayName: "Private edit" }, 2, "save");
    expect(publicPortfolio(changed)?.displayName).toBe("Alice Chen");
    expect((await store.readOwner(42))?.draft.displayName).toBe("Private edit");
    expect(publicPortfolio(await store.write(42, "Alice", changed.draft, 3, "unpublish"))).toBeNull();
    expect((await store.readOwner(42))?.draft.displayName).toBe("Private edit");
  });
  it("claims one address, rejects stale writes and isolates copies", async () => {
    const store = new MemoryPortfolioStore(null);
    const first = await store.write(42, "Alice", content(), 0, "save");
    first.draft.displayName = "mutated";
    expect((await store.readOwner(42))?.draft.displayName).toBe("Alice Chen");
    await expect(store.write(43, "Bob", content(), 0, "save")).rejects.toMatchObject({ status: 409, code: "address_taken" });
    const writes = await Promise.allSettled([store.write(42, "Alice", { ...content(), bio: "First" }, 1, "save"), store.write(42, "Alice", { ...content(), bio: "Second" }, 1, "save")]);
    expect(writes.map((write) => write.status)).toEqual(["fulfilled", "rejected"]);
    await expect(store.write(42, "Alice", { ...content(), slug: "other" }, 2, "save")).rejects.toMatchObject({ status: 400 });
    expect((await store.readOwner(42))?.draft.bio).toBe("First");
  });
  it("keeps saved and published data after a local process restart", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "opencircle-portfolio-")); directories.push(directory);
    const file = path.join(directory, "portfolios.json");
    await new MemoryPortfolioStore(file).write(42, "Alice", content(), 0, "publish");
    const restored = new MemoryPortfolioStore(file);
    expect(publicPortfolio((await restored.readSlug("alice"))!)?.displayName).toBe("Alice Chen");
  });
});

it("rejects SVG, mismatched image types and oversized image bodies", () => {
  expect(() => validatePortfolioImage(Buffer.from("<svg onload='alert(1)'/>"), "image/svg+xml")).toThrow();
  expect(() => validatePortfolioImage(Buffer.from("<svg onload='alert(1)'/>"), "image/png")).toThrow();
  expect(() => validatePortfolioImage(Buffer.alloc(3 * 1024 * 1024 + 1), "image/jpeg")).toThrow("3 MB");
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16)]);
  expect(validatePortfolioImage(png, "image/png")).toBe("png");
  expect(() => validatePortfolioImage(png, "image/webp")).toThrow();
});

it("generates member-specific share metadata without injecting user HTML", () => {
  const html = '<html><head><title>Board</title><meta name="description" content="Board"><meta property="og:image" content="board.png"><link rel="canonical" href="https://opencircle.cc/"><script type="application/ld+json">{"name":"Board"}</script></head><body></body></html>';
  const portfolio = { ...content(), displayName: 'Alice <script>"$&', bio: 'Hello </script><script>alert(1)</script>', githubLogin: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/42", publishedAt: 1 };
  const document = portfolioHtml(html, portfolio, "alice");
  expect(document).not.toContain("board.png"); expect(document).not.toContain("<script>alert(1)");
  expect(document).toContain("&lt;script&gt;&quot;$&amp;"); expect(document).toContain("\\u003c/script>");
  expect(document).toContain('href="https://opencircle.cc/p/alice"'); expect(document.match(/<title>/g)).toHaveLength(1);
  expect(portfolioHtml(html, null, "alice")).toContain('content="noindex, nofollow"');
  expect(publicPortfolioSlug("alice.opencircle.cc", "/")).toBe("alice");
  expect(publicPortfolioSlug("localhost:5173", "/p/Alice")).toBe("alice");
});
