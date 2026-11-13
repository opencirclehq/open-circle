/** Component library submissions: what members send and what admins review. */

export const COMPONENT_STATUSES = ["pending", "accepted", "declined"] as const;
export type ComponentSubmissionStatus = typeof COMPONENT_STATUSES[number];

export const COMPONENT_CATEGORIES = ["Layout", "Display", "Navigation", "Forms", "Feedback", "Motion", "Other"] as const;
export type ComponentCategory = typeof COMPONENT_CATEGORIES[number];

export const COMPONENT_LIMITS = { name: 60, tags: 5, tag: 24, dependencies: 10, source: 60_000, usage: 4_000, link: 300 } as const;
/** Request body ceiling for a submission: the source plus room for the other fields and JSON escaping. */
export const COMPONENT_MAX_BYTES = 160_000;

/** Everything needed to publish a component: its code, how to use it and what it needs. */
export interface ComponentSubmissionInput {
  name: string;
  category: ComponentCategory;
  tags: string[];
  /** The full component file. */
  source: string;
  /** A short example of rendering it. */
  usage: string;
  /** npm packages beyond React and Tailwind CSS. */
  dependencies: string[];
  /** Where it came from, if it's adapted or lives elsewhere too. */
  link: string;
}

export interface ComponentSubmission extends ComponentSubmissionInput {
  id: string;
  /** Unique per submission; also the file name and library address it would get. */
  slug: string;
  status: ComponentSubmissionStatus;
  createdAt: number;
  /** The signed-in GitHub account that sent it, when there was one. */
  submitter: { login: string; avatarUrl: string } | null;
  reviewedAt?: number;
  reviewer?: string;
}

export type ParsedSubmission =
  | { ok: true; value: ComponentSubmissionInput }
  | { ok: false; error: string; field: keyof ComponentSubmissionInput };

export const componentSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const BUILT_IN = new Set(["react", "react-dom", "tailwindcss"]);

/** Accepts a list or a comma/space separated string. */
function list(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return [...new Set(parts.filter((part): part is string => typeof part === "string").map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

export function parseComponentSubmission(input: unknown): ParsedSubmission {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  const source = typeof body.source === "string" ? body.source.replace(/\r\n?/g, "\n").trimEnd() : "";
  const usage = typeof body.usage === "string" ? body.usage.replace(/\r\n?/g, "\n").trim() : "";
  const rawLink = typeof body.link === "string" ? body.link.trim() : "";
  const tags = list(body.tags);
  const dependencies = list(body.dependencies).filter((name) => !BUILT_IN.has(name));

  if (name.length < 2 || name.length > COMPONENT_LIMITS.name || !componentSlug(name))
    return { ok: false, error: "Give the component a name (2 to 60 characters).", field: "name" };
  if (!COMPONENT_CATEGORIES.includes(body.category as ComponentCategory))
    return { ok: false, error: "Choose a category.", field: "category" };
  if (tags.length > COMPONENT_LIMITS.tags || tags.some((tag) => tag.length > COMPONENT_LIMITS.tag || !/^[a-z0-9-]+$/.test(tag)))
    return { ok: false, error: "Use up to 5 short tags, like: footer, canvas.", field: "tags" };
  if (source.trim().length < 20)
    return { ok: false, error: "Paste the component's code.", field: "source" };
  if (source.length > COMPONENT_LIMITS.source)
    return { ok: false, error: "The code is too long. Keep it to one component file.", field: "source" };
  if (usage.length > COMPONENT_LIMITS.usage)
    return { ok: false, error: "Keep the usage example short.", field: "usage" };
  if (dependencies.length > COMPONENT_LIMITS.dependencies || dependencies.some((dependency) => dependency.length > 214 || !NPM_NAME.test(dependency)))
    return { ok: false, error: "List extra packages by their npm names, like: motion, clsx.", field: "dependencies" };

  let link = "";
  if (rawLink) {
    let url: URL | null = null;
    try { url = new URL(rawLink); } catch { url = null; }
    if (url) url.hash = "";
    if (!url || url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.href.length > COMPONENT_LIMITS.link)
      return { ok: false, error: "The original link needs to start with https://.", field: "link" };
    link = url.href;
  }
  return { ok: true, value: { name, category: body.category as ComponentCategory, tags, source, usage, dependencies, link } };
}

/** A paste-ready Markdown page: what it is, what it needs, how to use it and the full source. */
export function componentMarkdown(doc: { name: string; description?: string; category: string; tags: string[]; dependencies: string[]; usage: string; source: string; file: string; credit?: string }) {
  const extension = doc.file.split(".").pop() ?? "tsx";
  return [
    `# ${doc.name}`,
    "",
    ...(doc.description ? [doc.description, ""] : []),
    `**Category:** ${doc.category}${doc.tags.length ? ` · **Tags:** ${doc.tags.join(", ")}` : ""}`,
    "",
    "## Requirements",
    "",
    `React and Tailwind CSS${doc.dependencies.length ? `, plus: ${doc.dependencies.join(", ")}` : ". No other packages."}`,
    ...(doc.usage ? ["", "## Usage", "", "```tsx", doc.usage, "```"] : []),
    "",
    `## Source (\`${doc.file}\`)`,
    "",
    `\`\`\`${extension}`,
    doc.source.trimEnd(),
    "```",
    ...(doc.credit ? ["", `_${doc.credit}_`] : []),
    "",
  ].join("\n");
}

export function submissionMarkdown(submission: ComponentSubmission) {
  const credit = [submission.submitter && `Submitted by @${submission.submitter.login}.`, submission.link && `Original: ${submission.link}`].filter(Boolean).join(" ");
  return componentMarkdown({ ...submission, file: `${submission.slug}.tsx`, credit: credit || undefined });
}
