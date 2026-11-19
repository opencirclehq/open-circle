/** What the library says about each component. Shared so the server can describe a page without loading its demo. */
export interface ComponentMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  credit?: string;
}

export const COMPONENT_META: readonly ComponentMeta[] = [
  {
    slug: "split-footer",
    name: "Split Footer",
    description: "A dark brand panel lit by drifting ASCII light beside a white link panel, with the wordmark fading up from the bottom.",
    category: "Layout",
    tags: ["footer", "ascii", "canvas", "landing"],
    credit: "Adapted from the Dailo landing footer.",
  },
  {
    slug: "icon-folder",
    name: "Icon Folder",
    description: "A glass folder with app icons fanned out of it. Pops in on view; hover, tap or Enter spreads the icons wider.",
    category: "Display",
    tags: ["folder", "icons", "glass", "hover"],
    credit: "Adapted from the 21st.dev Icon Folder.",
  },
  {
    slug: "draw-a-line",
    name: "Draw a Line",
    description: "A toy train set on a tilted table. Move across it to lay track; the train follows, climbs a bridge wherever you cross your own line and puffs your app icons onto the table. It all fades once you stop.",
    category: "Motion",
    tags: ["train", "2.5d", "canvas", "interactive"],
  },
  {
    slug: "scroll-deck",
    name: "Scroll Deck",
    description: "A pinned, scroll-scrubbed hero: cards rise into a fan, scatter and tumble in 3D around a second headline that reveals word by word, then sweep back into a fan that turns on its pivot.",
    category: "Motion",
    tags: ["scroll", "cards", "3d", "hero"],
  },
];

export function componentMeta(slug: string | undefined): ComponentMeta | undefined {
  return COMPONENT_META.find((component) => component.slug === slug);
}

export function componentSlugFromPath(pathname: string): string | null {
  const slug = /^\/components\/([a-z0-9-]+)$/.exec(pathname)?.[1];
  return slug && componentMeta(slug) ? slug : null;
}
