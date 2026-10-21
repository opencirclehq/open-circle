import { createElement, useMemo } from "react";
import Markdown from "react-markdown";
import { blogMarkdownOptions } from "@shared/blog-markdown";
import { cn } from "@/lib/utils";
import { BlogEmbedView } from "./blog-embed";
import "./blog.css";

/** A post body, rendered as the published page shows it, with YouTube and Gist links on their own line embedded. */
export function BlogBody({ children, className }: { children: string; className?: string }) {
  const options = useMemo(() => blogMarkdownOptions(createElement, (embed, title, href) => <BlogEmbedView embed={embed} title={title} href={href} />), []);
  return <div className={cn("blog-body", className)}><Markdown {...options}>{children}</Markdown></div>;
}
