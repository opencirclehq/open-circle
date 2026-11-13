import { CONTACT_KINDS, MAX_PORTFOLIO_SKILLS, MAX_PORTFOLIO_SKILL_LENGTH, PORTFOLIO_ACCENTS, RESERVED_PORTFOLIO_SLUGS, type PortfolioContent, type PortfolioProject } from "./portfolio.js";

export class PortfolioValidationError extends Error {
  constructor(message: string, readonly field: string) { super(message); }
}

function fail(message: string, field: string): never { throw new PortfolioValidationError(message, field); }

function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max) fail(`Keep ${field} within ${max.toLocaleString("en-US")} characters.`, field);
  const result = value.trim();
  if (required && !result) fail(`Add your ${field}.`, field);
  return result;
}

export function safePortfolioUrl(value: unknown, field = "link"): string {
  const input = text(value, field, 2048);
  if (!input) return "";
  let url: URL;
  try { url = new URL(input); } catch { return fail("Use a full HTTPS link.", field); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".") || url.hostname.endsWith(".local") || url.hostname.endsWith(".localhost") || /^\d+(\.\d+){3}$/.test(url.hostname) || url.hostname.includes(":")) fail("Use a public HTTPS link without a password or port.", field);
  return url.href;
}

export function parsePortfolio(input: unknown, savedSlug?: string): PortfolioContent {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Add your portfolio details.", "portfolio");
  const body = input as Record<string, unknown>;
  const slug = text(body.slug, "address", 39, true).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(slug) || RESERVED_PORTFOLIO_SLUGS.has(slug)) fail("Choose an available address using 1–39 letters, numbers or hyphens.", "slug");
  if (savedSlug && slug !== savedSlug) fail("Your saved portfolio address cannot be changed.", "slug");
  if (!["dark", "light"].includes(String(body.theme))) fail("Choose a page theme.", "theme");
  if (typeof body.accent !== "string" || !Object.prototype.hasOwnProperty.call(PORTFOLIO_ACCENTS, body.accent)) fail("Choose an accent color.", "accent");
  if (!["studio", "aurora", "contour"].includes(String(body.coverStyle))) fail("Choose a cover style.", "coverStyle");
  if (!["available", "selective", "unavailable"].includes(String(body.availability))) fail("Choose your availability.", "availability");
  if (typeof body.coverPosition !== "number" || !Number.isFinite(body.coverPosition) || body.coverPosition < 0 || body.coverPosition > 100) fail("Choose a cover position between 0 and 100.", "coverPosition");
  if (!Array.isArray(body.skills) || body.skills.length > MAX_PORTFOLIO_SKILLS) fail(`Add up to ${MAX_PORTFOLIO_SKILLS} skills.`, "skills");
  const skills = [...new Set(body.skills.map((skill) => {
    if (typeof skill !== "string" || !skill.trim()) fail("Add a name for each skill.", "skills");
    const value = skill.trim();
    if (value.length > MAX_PORTFOLIO_SKILL_LENGTH) fail(`Keep each skill within ${MAX_PORTFOLIO_SKILL_LENGTH} characters. Separate different skills with commas, semicolons or new lines.`, "skills");
    return value;
  }))];
  if (!Array.isArray(body.contacts) || body.contacts.length > 4) fail("Add up to four contact methods.", "contacts");
  const contacts = body.contacts.map((item: unknown) => {
    if (!item || typeof item !== "object") return fail("Check your contact details.", "contacts");
    const contact = item as Record<string, unknown>;
    if (!CONTACT_KINDS.includes(contact.kind as typeof CONTACT_KINDS[number]) || typeof contact.visible !== "boolean") fail("Choose a contact method and visibility.", "contacts");
    const kind = contact.kind as typeof CONTACT_KINDS[number];
    let value = text(contact.value, kind, kind === "email" ? 254 : 2048);
    if (value && kind === "email" && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) || /[\r\n?#]/.test(value))) fail("Add a valid email address.", "email");
    if (value && kind === "whatsapp") {
      value = value.replace(/[\s()-]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(value)) fail("Use an international WhatsApp number, starting with +.", "whatsapp");
    }
    if (value && ["website", "linkedin"].includes(kind)) {
      value = safePortfolioUrl(value, kind);
      if (kind === "linkedin" && !["linkedin.com", "www.linkedin.com"].includes(new URL(value).hostname)) fail("Use a linkedin.com profile link.", "linkedin");
    }
    return { kind, value, visible: contact.visible };
  });
  if (new Set(contacts.map((contact) => contact.kind)).size !== contacts.length) fail("Use each contact method once.", "contacts");
  const primaryContact = body.primaryContact as PortfolioContent["primaryContact"];
  if (primaryContact !== "none" && !contacts.some((contact) => contact.kind === primaryContact && contact.visible && contact.value)) fail("Choose a visible contact for the hire button, or turn it off.", "primaryContact");
  if (!Array.isArray(body.projects) || body.projects.length > 6) fail("Choose up to six repositories.", "projects");
  const projects = body.projects.map((item: unknown): PortfolioProject => {
    if (!item || typeof item !== "object") return fail("Choose a public repository.", "projects");
    const project = item as Record<string, unknown>;
    const repo = project.repository as Record<string, unknown> | null;
    if (!repo || !Number.isSafeInteger(repo.id) || Number(repo.id) <= 0) fail("Choose a public repository.", "projects");
    const fullName = text(repo.fullName, "repository", 200);
    if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName)) fail("Choose a valid GitHub repository.", "projects");
    return {
      repository: { id: Number(repo.id), name: text(repo.name, "repository name", 100), fullName, description: text(repo.description, "repository description", 1000), language: text(repo.language, "language", 100), stars: Number.isSafeInteger(repo.stars) && Number(repo.stars) >= 0 ? Number(repo.stars) : 0, forks: Number.isSafeInteger(repo.forks) && Number(repo.forks) >= 0 ? Number(repo.forks) : 0, url: `https://github.com/${fullName.split("/").map(encodeURIComponent).join("/")}`, homepage: safePortfolioUrl(repo.homepage ?? "", "project website") },
      title: text(project.title, "project title", 100), summary: text(project.summary, "project summary", 500), imageUrl: safePortfolioUrl(project.imageUrl, "project image"),
    };
  });
  if (new Set(projects.map((project) => project.repository.id)).size !== projects.length) fail("Each repository can only appear once.", "projects");
  return {
    slug, displayName: text(body.displayName, "name", 80, true), headline: text(body.headline, "headline", 120), bio: text(body.bio, "bio", 500), location: text(body.location, "location", 80), readme: text(body.readme, "README", 20_000),
    coverUrl: safePortfolioUrl(body.coverUrl, "cover image"), coverPosition: body.coverPosition, coverStyle: body.coverStyle as PortfolioContent["coverStyle"], theme: body.theme as PortfolioContent["theme"], accent: body.accent as PortfolioContent["accent"], availability: body.availability as PortfolioContent["availability"], skills, contacts, primaryContact, projects,
  };
}
