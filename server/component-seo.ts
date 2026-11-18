import { componentMeta, componentSlugFromPath } from "../shared/component-meta.js";
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
