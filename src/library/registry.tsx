import type { ComponentType } from "react";
import { componentMarkdown } from "@shared/components";
import { componentMeta, type ComponentMeta } from "@shared/component-meta";
import { BoltIcon, CodeSquareIcon, GalleryIcon, PaletteIcon } from "@solar-icons/react/bold-duotone";
import { DrawALine } from "./items/draw-a-line";
import drawALineSource from "./items/draw-a-line.tsx?raw";
import { IconFolder } from "./items/icon-folder";
import iconFolderSource from "./items/icon-folder.tsx?raw";
import { SplitFooter } from "./items/split-footer";
import splitFooterSource from "./items/split-footer.tsx?raw";

export type CanvasTheme = "dark" | "light";

export interface LibraryItem extends ComponentMeta {
  /** File name the source is copied as. */
  file: string;
  /** The exact source rendered in the preview. */
  source: string;
  /** Packages beyond React and Tailwind CSS. */
  dependencies: string[];
  usage: string;
  /** Bento card size on the library grid. */
  card: "wide" | "tall";
  /** Width the component is laid out at before scaling down to fit, for full-width components. */
  designWidth?: number;
  /** Live demo with sample props; receives the preview canvas theme. */
  Demo: ComponentType<{ theme: CanvasTheme }>;
}

function FooterDemo() {
  return (
    <SplitFooter
      brand="OpenCircle"
      tagline={["Paste your username.", "Take your place."]}
      groups={[
        { title: "Community", links: [{ label: "Leaderboard", href: "#" }, { label: "Blog", href: "#" }, { label: "Events", href: "#" }] },
        { title: "Build", links: [{ label: "Portfolio", href: "#" }, { label: "Components", href: "#" }, { label: "Tools", href: "#" }] },
        { title: "Legal", links: [{ label: "Privacy", href: "#" }, { label: "Terms", href: "#" }] },
      ]}
      socials={[
        { label: "GitHub", href: "https://github.com", icon: "github" },
        { label: "X", href: "https://x.com", icon: "x" },
        { label: "LinkedIn", href: "https://www.linkedin.com", icon: "linkedin" },
      ]}
    />
  );
}

const tile = (node: React.ReactNode, background: string, label: string) => ({ node, background, label });

function FolderDemo({ theme }: { theme: CanvasTheme }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <IconFolder
        title="Design kit"
        theme={theme}
        showPill
        icons={[
          tile(<PaletteIcon size={40} className="text-white" />, "linear-gradient(160deg,#a855f7,#6d28d9)", "Colour"),
          tile(<GalleryIcon size={40} className="text-white" />, "linear-gradient(160deg,#38bdf8,#1d4ed8)", "Media"),
          tile(<CodeSquareIcon size={40} className="text-white" />, "linear-gradient(160deg,#34d399,#047857)", "Code"),
          tile(<BoltIcon size={40} className="text-white" />, "linear-gradient(160deg,#fbbf24,#ea580c)", "Motion"),
        ]}
      />
    </div>
  );
}

function TrainDemo({ theme }: { theme: CanvasTheme }) {
  return (
    <DrawALine
      theme={theme}
      cargo={[
        tile(<PaletteIcon />, "linear-gradient(160deg,#a855f7,#6d28d9)", "Colour"),
        tile(<GalleryIcon />, "linear-gradient(160deg,#38bdf8,#1d4ed8)", "Media"),
        tile(<CodeSquareIcon />, "linear-gradient(160deg,#34d399,#047857)", "Code"),
        tile(<BoltIcon />, "linear-gradient(160deg,#fbbf24,#ea580c)", "Motion"),
      ].map(({ node, background, label }) => ({ icon: node, color: background, label }))}
    />
  );
}

/** The library's wording lives in shared/component-meta so the server can describe a page without these demos. */
export const LIBRARY: LibraryItem[] = [
  {
    ...componentMeta("split-footer")!,
    file: "split-footer.tsx",
    source: splitFooterSource,
    dependencies: [],
    usage: `import { SplitFooter } from "./split-footer";

<SplitFooter
  brand="Acme"
  tagline={["Three questions a day.", "One morning digest."]}
  groups={[{ title: "Product", links: [{ label: "Pricing", href: "/pricing" }] }]}
  socials={[{ label: "Acme on X", href: "https://x.com/acme", icon: "x" }]}
/>`,
    card: "wide",
    designWidth: 1200,
    Demo: FooterDemo,
  },
  {
    ...componentMeta("icon-folder")!,
    file: "icon-folder.tsx",
    source: iconFolderSource,
    dependencies: [],
    usage: `import { IconFolder } from "./icon-folder";

<IconFolder
  title="Design kit"
  theme="dark"
  icons={[{ src: "/figma.png", label: "Figma" }, { src: "/linear.png", label: "Linear" }]}
/>`,
    card: "tall",
    Demo: FolderDemo,
  },
  {
    ...componentMeta("draw-a-line")!,
    file: "draw-a-line.tsx",
    source: drawALineSource,
    dependencies: [],
    usage: `import { DrawALine } from "./draw-a-line";

<DrawALine
  title={["Draw a", "line."]}
  description="Lay track with your cursor."
  cargo={[{ icon: <AppIcon />, color: "#6d28d9", label: "App" }]}
/>`,
    card: "wide",
    Demo: TrainDemo,
  },
];

export function findItem(slug: string | undefined) {
  return LIBRARY.find((item) => item.slug === slug);
}

export function searchLibrary(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return LIBRARY;
  return LIBRARY.filter((item) => [item.name, item.description, item.category, ...item.tags].some((value) => value.toLowerCase().includes(q)));
}

/** A paste-ready Markdown page: what it is, how to use it and the full source. */
export function itemMarkdown(item: LibraryItem) {
  return componentMarkdown(item);
}
