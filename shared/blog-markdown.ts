import type { createElement, ReactNode } from "react";
import { fromMarkdown } from "mdast-util-from-markdown";
import { defaultUrlTransform, type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogEmbed, type BlogEmbed } from "./blog.js";

const LINK = /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i;

/**
 * One rendering policy for member posts, used by the page, the editor preview
 * and the server-rendered article. Raw HTML is dropped, links must be web,
 * mail or same-site addresses, and images must be HTTPS.
 */
export function blogUrlTransform(url: string, key: string): string {
  if (key === "src") return /^https:\/\//i.test(url) ? defaultUrlTransform(url) : "";
  return LINK.test(url) ? defaultUrlTransform(url) : "";
}

type Node = { type: string; url?: string; alt?: string | null; children?: Node[] };

/**
 * Anything the renderer would drop is refused at submission rather than
 * disappearing from the published post.
 */
export function blogMarkdownProblem(markdown: string): string | null {
  const stack: Node[] = [fromMarkdown(markdown) as Node];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "html") return "Remove the raw HTML from your post. It isn't published; use Markdown instead, or put code in a code block.";
    if ((node.type === "image" || node.type === "imageReference") && !node.alt?.trim()) return "Describe every image in its alt text, so people using screen readers know what it shows.";
    if (node.type === "image" && !/^https:\/\//i.test(node.url ?? "")) return "Use https:// addresses for images.";
    if ((node.type === "link" || node.type === "definition") && !LINK.test(node.url ?? "")) return "Links must start with https://, http://, mailto:, / or #.";
    stack.push(...node.children ?? []);
  }
  return null;
}

type Element = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Element[] };
const text = (node: Element): string => node.type === "text" ? node.value ?? "" : (node.children ?? []).map(text).join("");

/** A paragraph holding nothing but one embeddable link. */
function paragraphEmbed(node: Element | undefined): { embed: BlogEmbed; title: string } | null {
  const children = (node?.children ?? []).filter((child) => !(child.type === "text" && !child.value?.trim()));
  const link = children.length === 1 && children[0].type === "element" && children[0].tagName === "a" ? children[0] : null;
  const embed = typeof link?.properties?.href === "string" ? blogEmbed(link.properties.href) : null;
  return embed && link ? { embed, title: text(link).trim() } : null;
}

export type BlogEmbedRenderer = (embed: BlogEmbed, title: string, href: string) => ReactNode;

/** Pass `embed` to render embeds; without it they stay as plain links. */
export function blogMarkdownOptions(h: typeof createElement, embed?: BlogEmbedRenderer): Readonly<Options> {
  const components: Components = {
    // The post title is the page's only h1.
    h1: ({ children }) => h("h2", null, children as ReactNode),
    p: ({ node, children }) => {
      const found = embed ? paragraphEmbed(node as Element) : null;
      return found ? embed!(found.embed, found.title, String((node as Element).children!.find((child) => child.tagName === "a")!.properties!.href)) : h("p", null, children as ReactNode);
    },
    a: ({ href, children }) => {
      if (!href) return h("span", null, children as ReactNode);
      const external = /^https?:\/\//i.test(href);
      return h("a", { href, ...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {}) }, children as ReactNode);
    },
    img: ({ src, alt }) => typeof src === "string" && src ? h("img", { src, alt: alt ?? "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }) : null,
    input: ({ type, checked }) => type === "checkbox" ? h("input", { type: "checkbox", checked: !!checked, disabled: true, readOnly: true }) : null,
  };
  return { remarkPlugins: [remarkGfm], skipHtml: true, urlTransform: blogUrlTransform, components };
}
