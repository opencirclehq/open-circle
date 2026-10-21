import type { GitHubProfile } from "./community.js";
import type { PortfolioPost } from "./blog.js";

export const PORTFOLIO_DOMAIN = "opencircle.cc";
export const MAX_PORTFOLIO_BYTES = 128_000;
export const MAX_PORTFOLIO_SKILLS = 12;
export const MAX_PORTFOLIO_SKILL_LENGTH = 80;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const RESERVED_PORTFOLIO_SLUGS = new Set(["www", "wa", "admin", "api", "app", "mail", "support", "help", "name", "opencircle", "assets", "static", "cdn", "auth", "portfolio", "portfolios", "preview", "settings", "cp", "dev", "staging", "sandbox", "media", "uploads", "images", "status", "billing", "account", "accounts", "dashboard", "login", "docs", "blog", "email", "smtp", "imap", "pop", "mx", "ns1", "ns2", "ftp"]);
export const PORTFOLIO_ACCENTS = {
  silver: { label: "Silver", color: "#d5dce8", ink: "#202938" },
  mint: { label: "Mint", color: "#8bdbc0", ink: "#185640" },
  blue: { label: "Sky", color: "#a4caff", ink: "#244f95" },
  amber: { label: "Amber", color: "#edc38b", ink: "#7c4c17" },
  rose: { label: "Rose", color: "#efb4c3", ink: "#8d3451" },
} as const;
export type PortfolioAccent = keyof typeof PORTFOLIO_ACCENTS;
export const CONTACT_KINDS = ["email", "website", "linkedin", "whatsapp"] as const;
export type ContactKind = typeof CONTACT_KINDS[number];
export const CONTACT_LABELS: Record<ContactKind, string> = { email: "Email", website: "Website", linkedin: "LinkedIn", whatsapp: "WhatsApp" };

export interface PortfolioContact {
  kind: ContactKind;
  value: string;
  visible: boolean;
}

export interface PortfolioRepository {
  id: number;
  name: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  url: string;
  homepage: string;
}

export interface PortfolioProject {
  repository: PortfolioRepository;
  title: string;
  summary: string;
  imageUrl: string;
}

export interface PortfolioContent {
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  readme: string;
  coverUrl: string;
  coverPosition: number;
  coverStyle: "studio" | "aurora" | "contour";
  theme: "dark" | "light";
  accent: PortfolioAccent;
  availability: "available" | "selective" | "unavailable";
  skills: string[];
  contacts: PortfolioContact[];
  primaryContact: ContactKind | "none";
  projects: PortfolioProject[];
}

export interface PortfolioRecord {
  ownerId: number;
  githubLogin: string;
  draft: PortfolioContent;
  published: PortfolioContent | null;
  version: number;
  publishedAt: number | null;
  updatedAt: number;
}

export interface PublicPortfolio extends PortfolioContent {
  githubLogin: string;
  avatarUrl: string;
  publishedAt: number;
}

/** The public portfolio API also lists the owner's latest blog posts. */
export type PublicPortfolioPage = PublicPortfolio & { posts: PortfolioPost[] };

export interface PortfolioEditorState {
  profile: GitHubProfile;
  /** The owner's published blog posts, as the portfolio will list them. */
  posts: PortfolioPost[];
  draft: PortfolioContent;
  version: number;
  publishedAt: number | null;
  updatedAt: number | null;
  uploadsAvailable: boolean;
  subdomainsAvailable: boolean;
}

export interface PortfolioGitHubPage {
  repositories: PortfolioRepository[];
  nextPage: number | null;
}

export function defaultPortfolio(profile: GitHubProfile): PortfolioContent {
  return {
    slug: profile.login.toLowerCase(), displayName: profile.login, headline: "", bio: "", location: "", readme: "",
    coverUrl: "", coverPosition: 50, coverStyle: "studio", theme: "dark", accent: "silver",
    availability: "unavailable", skills: [], contacts: [], primaryContact: "none", projects: [],
  };
}

export function portfolioHostname(slug: string): string {
  return `${slug}.${PORTFOLIO_DOMAIN}`;
}

export function portfolioSlugFromHostname(hostname: string): string | null {
  const suffix = `.${PORTFOLIO_DOMAIN}`;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (RESERVED_PORTFOLIO_SLUGS.has(slug)) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(slug) ? slug : null;
}

export function contactHref(contact: PortfolioContact): string {
  if (contact.kind === "email") return `mailto:${contact.value}`;
  if (contact.kind === "whatsapp") return `https://wa.me/${contact.value.replace(/\D/g, "")}`;
  return contact.value;
}

export function publicPortfolio(record: PortfolioRecord): PublicPortfolio | null {
  if (!record.published || !record.publishedAt) return null;
  const content = structuredClone(record.published);
  content.contacts = content.contacts.filter((contact) => contact.visible && contact.value);
  if (!content.contacts.some((contact) => contact.kind === content.primaryContact)) content.primaryContact = "none";
  return { ...content, githubLogin: record.githubLogin, avatarUrl: `https://avatars.githubusercontent.com/u/${record.ownerId}?s=240`, publishedAt: record.publishedAt };
}
