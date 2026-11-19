import { BRAND_NAME, DEFAULT_SITE_URL } from "./brand.js";
import type { ComponentMeta } from "./component-meta.js";
import { shareImageVersion } from "./share-image.js";
import { seoDocument, type SeoDocument } from "./seo.js";

/** Changes with the card's wording, so an edited description is not served from a cached image. */
export function componentImageVersion(component: Pick<ComponentMeta, "name" | "description" | "category" | "tags">): string {
  return shareImageVersion(component.name, component.description, component.category, ...component.tags);
}

export function componentSeoDocument(component: ComponentMeta, origin = DEFAULT_SITE_URL): SeoDocument {
  const path = `/components/${component.slug}`;
  const document = seoDocument(path, origin);
  return {
    ...document, path, url: new URL(path, document.url).href,
    title: `${component.name} · Components · ${BRAND_NAME}`, heading: component.name,
    description: component.description, summary: component.description,
    image: {
      url: new URL(`/api/component-image?${new URLSearchParams({ slug: component.slug, v: componentImageVersion(component) })}`, document.url).href,
      alt: `Component: ${component.name}`, contentType: "image/png", width: 1200, height: 630,
    },
  };
}
