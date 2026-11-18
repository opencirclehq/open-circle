import type { ComponentType } from "react";
import { componentMarkdown } from "@shared/components";
import { BoltIcon, ChartSquareIcon, ChatRoundDotsIcon, CodeSquareIcon, GalleryIcon, MapPointIcon, NotebookIcon, PaletteIcon, WalletIcon } from "@solar-icons/react/bold-duotone";
import { DrawALine } from "./items/draw-a-line";
import drawALineSource from "./items/draw-a-line.tsx?raw";
import { IconFolder } from "./items/icon-folder";
import { ScrollDeck } from "./items/scroll-deck";
import scrollDeckSource from "./items/scroll-deck.tsx?raw";
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
  /** Bento shape on the library grid: big is 2×2, wide 2×1, tall 1×2. */
  card: "big" | "wide" | "tall";
  /** Width the component is laid out at before scaling down to fit, for full-width components. */
  designWidth?: number;
  /** With designWidth: a fixed screen height, so the preview is a whole screen (a hero) scaled to fit. */
  designHeight?: number;
  /** Width the grid thumbnail is drawn at before scaling into its card. */
  thumbWidth?: number;
  /** Live demo with sample props; receives the canvas theme, and whether it fills the screen. */
  Demo: ComponentType<{ theme: CanvasTheme; fullscreen?: boolean }>;
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

const DECK_CARDS = [
  { name: "Harbor", caption: "harbor.app", icon: <ChatRoundDotsIcon />, colors: ["#5f8f88", "#3c6660"] },
  { name: "Ledger", caption: "ledger.money", icon: <WalletIcon />, colors: ["#2a2c3c", "#11121a"] },
  { name: "Plume", caption: "plume.studio", icon: <PaletteIcon />, colors: ["#8b5cf6", "#4c1d95"] },
  { name: "Fieldnote", caption: "fieldnote.io", icon: <NotebookIcon />, colors: ["#3a3a3f", "#1a1414"] },
  { name: "Orbit", caption: "orbit.dev", icon: <ChartSquareIcon />, colors: ["#1e3a8a", "#0b1640"] },
  { name: "Wayfare", caption: "wayfare.travel", icon: <MapPointIcon />, colors: ["#c2734f", "#7a3a22"] },
  { name: "Quill", caption: "quill.to", icon: <CodeSquareIcon />, colors: ["#ea7a45", "#b4451c"] },
] satisfies { name: string; caption: string; icon: React.ReactNode; colors: [string, string] }[];

function DeckDemo({ theme }: { theme: CanvasTheme }) {
  return (
    <ScrollDeck
      theme={theme}
      cards={DECK_CARDS}
      intro="We build apps."
      headline={["~From~ a real problem", "~to~ an app people ~actually~ use."]}
      subtitle="A small studio with a few apps live and more on the way."
    />
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
    designWidth: 1200,
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
  {
    slug: "draw-a-line",
    name: "Draw a Line",
    description: "A toy train set on a tilted table. Move across it to lay track; the train follows, climbs a bridge wherever you cross your own line and puffs your app icons onto the table. It all fades once you stop.",
    category: "Motion",
    tags: ["train", "2.5d", "canvas", "interactive"],
    file: "draw-a-line.tsx",
    source: drawALineSource,
    dependencies: [],
    usage: `import { DrawALine } from "./draw-a-line";

<DrawALine
  title={["Draw a", "line."]}
  description="Lay track with your cursor."
  cargo={[{ icon: <AppIcon />, color: "#6d28d9", label: "App" }]}
/>`,
    card: "big",
    thumbWidth: 900,
    Demo: TrainDemo,
  },
  {
    slug: "scroll-deck",
    name: "Scroll Deck",
    description: "A pinned, scroll-scrubbed hero: cards rise into a fan, scatter and tumble in 3D around a second headline that reveals word by word, then sweep back into a fan that turns on its pivot.",
    category: "Motion",
    tags: ["scroll", "cards", "3d", "hero"],
    file: "scroll-deck.tsx",
    source: scrollDeckSource,
    dependencies: [],
    usage: `import { ScrollDeck } from "./scroll-deck";

<ScrollDeck
  scroll="page"
  intro="We build apps."
  headline={["~From~ a real problem", "~to~ an app people ~actually~ use."]}
  cards={[{ name: "Harbor", caption: "harbor.app", icon: <ChatIcon />, colors: ["#5f8f88", "#3c6660"] }]}
/>`,
    card: "big",
    designWidth: 1440,
    designHeight: 900,
    thumbWidth: 1200,
    Demo: DeckDemo,
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
