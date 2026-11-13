/** Component library submissions: what members send and what admins review. */

export const COMPONENT_STATUSES = ["pending", "accepted", "declined"] as const;
export type ComponentSubmissionStatus = typeof COMPONENT_STATUSES[number];

export interface ComponentSubmissionInput {
  name: string;
  link: string;
  description: string;
}

export interface ComponentSubmission extends ComponentSubmissionInput {
  id: string;
  status: ComponentSubmissionStatus;
  createdAt: number;
  /** The signed-in GitHub account that sent it, when there was one. */
  submitter: { login: string; avatarUrl: string } | null;
  reviewedAt?: number;
  reviewer?: string;
}

export const COMPONENT_LIMITS = { name: 60, link: 300, description: 500 } as const;

export type ParsedSubmission =
  | { ok: true; value: ComponentSubmissionInput }
  | { ok: false; error: string; field: keyof ComponentSubmissionInput };

export function parseComponentSubmission(input: unknown): ParsedSubmission {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const name = text(body.name);
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const rawLink = typeof body.link === "string" ? body.link.trim() : "";

  if (name.length < 2 || name.length > COMPONENT_LIMITS.name)
    return { ok: false, error: "Give the component a name (2 to 60 characters).", field: "name" };
  let link: URL | null = null;
  try { link = new URL(rawLink); } catch { link = null; }
  if (link) link.hash = "";
  if (!link || link.protocol !== "https:" || link.username || link.password || !link.hostname.includes(".") || link.href.length > COMPONENT_LIMITS.link)
    return { ok: false, error: "Add an https:// link to the code (GitHub, a gist or 21st.dev).", field: "link" };
  if (description.length > COMPONENT_LIMITS.description)
    return { ok: false, error: "Keep the description under 500 characters.", field: "description" };
  return { ok: true, value: { name, link: link.href, description } };
}
