import type { ComponentType } from "react";
import { BoltIcon, CodeSquareIcon, GalleryIcon, PaletteIcon } from "@solar-icons/react/bold-duotone";
import { IconFolder } from "./items/icon-folder";
import iconFolderSource from "./items/icon-folder.tsx?raw";
import { SplitFooter } from "./items/split-footer";
import splitFooterSource from "./items/split-footer.tsx?raw";

export type CanvasTheme = "dark" | "light";

export interface LibraryItem {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** File name the source is copied as. */
  file: string;
  /** The exact source rendered in the preview. */
  source: string;
  /** Packages beyond React and Tailwind CSS. */
  dependencies: string[];
  usage: string;
  credit?: string;
  /** Bento card size on the library grid. */
  card: "wide" | "tall";
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
    <div className="flex w-full justify-center p-6">
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

export const LIBRARY: LibraryItem[] = [
  {
    slug: "split-footer",
    name: "Split Footer",
    description: "A dark brand panel lit by drifting ASCII light beside a white link panel, with the wordmark fading up from the bottom.",
    category: "Layout",
    tags: ["footer", "ascii", "canvas", "landing"],
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
    credit: "Adapted from the Dailo landing footer.",
    card: "wide",
    Demo: FooterDemo,
  },
  {
    slug: "icon-folder",
    name: "Icon Folder",
    description: "A glass folder with app icons fanned out of it. Pops in on view; hover, tap or Enter spreads the icons wider.",
    category: "Display",
    tags: ["folder", "icons", "glass", "hover"],
    file: "icon-folder.tsx",
    source: iconFolderSource,
    dependencies: [],
    usage: `import { IconFolder } from "./icon-folder";

<IconFolder
  title="Design kit"
  theme="dark"
  icons={[{ src: "/figma.png", label: "Figma" }, { src: "/linear.png", label: "Linear" }]}
/>`,
    credit: "Adapted from the 21st.dev Icon Folder.",
    card: "tall",
    Demo: FolderDemo,
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
  const extension = item.file.split(".").pop() ?? "tsx";
  return [
    `# ${item.name}`,
    "",
    item.description,
    "",
    `**Category:** ${item.category} · **Tags:** ${item.tags.join(", ")}`,
    "",
    "## Requirements",
    "",
    `React and Tailwind CSS${item.dependencies.length ? `, plus: ${item.dependencies.join(", ")}` : ". No other packages."}`,
    "",
    "## Usage",
    "",
    "```tsx",
    item.usage,
    "```",
    "",
    `## Source (\`${item.file}\`)`,
    "",
    `\`\`\`${extension}`,
    item.source.trimEnd(),
    "```",
    ...(item.credit ? ["", `_${item.credit}_`] : []),
    "",
  ].join("\n");
}
