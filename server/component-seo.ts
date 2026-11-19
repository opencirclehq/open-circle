import { readFile } from "node:fs/promises";
import path from "node:path";
import { componentMeta, componentSlugFromPath } from "../shared/component-meta.js";
import { COMPONENT_SCREENSHOTS } from "../shared/component-og.js";
import { componentImageVersion, componentSeoDocument } from "../shared/component-seo.js";
import type { SeoDocument } from "../shared/seo.js";
import type { ShareCard } from "./forum-image.js";

export function componentPageSeoDocument(pathname: string, origin: string): SeoDocument | null {
  const slug = componentSlugFromPath(pathname);
  return slug ? componentSeoDocument(componentMeta(slug)!, origin) : null;
}

export function componentShareCard(slug: string): { key: string; card: ShareCard } | null {
  const component = componentMeta(slug);
  if (!component) return null;
  return {
    key: `component:${component.slug}:${componentImageVersion(component)}`,
    card: { label: "Component", title: component.name, description: component.description, author: component.tags.map((tag) => `#${tag}`).join(" "), category: component.category },
  };
}

/**
 * The captured picture of a component (public/og/components/<slug>.png), when one has been taken.
 * Built sites serve it from dist/, development from public/. Only known slugs reach the file system.
 */
export async function componentScreenshot(slug: string): Promise<Buffer | null> {
  if (!componentMeta(slug) || !COMPONENT_SCREENSHOTS[slug]) return null;
  for (const folder of ["dist", "public"]) {
    try {
      return await readFile(path.resolve(process.cwd(), folder, "og", "components", `${slug}.png`));
    } catch {
      // Try the next location.
    }
  }
  return null;
}
