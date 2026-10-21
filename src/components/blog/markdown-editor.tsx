import "@mdxeditor/editor/style.css";
import "./blog.css";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  BlockTypeSelect, BoldItalicUnderlineToggles, ButtonWithTooltip, CodeToggle, CreateLink, DiffSourceToggleWrapper, InsertCodeBlock, InsertImage, InsertTable,
  InsertThematicBreak, ListsToggle, MDXEditor, Separator, StrikeThroughSupSubToggles, UndoRedo, codeBlockPlugin, codeMirrorPlugin, diffSourcePlugin, headingsPlugin,
  imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin, tablePlugin, thematicBreakPlugin, toolbarPlugin, type MDXEditorMethods,
} from "@mdxeditor/editor";
import { VideoFramePlayHorizontalIcon } from "@solar-icons/react/linear";
import { EmbedDialog } from "./embed-dialog";
import { placeEmbed } from "./place-embed";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const LANGUAGES = {
  "": "Plain text", bash: "Shell", css: "CSS", go: "Go", html: "HTML", java: "Java", js: "JavaScript", json: "JSON", jsx: "JSX",
  kotlin: "Kotlin", md: "Markdown", php: "PHP", py: "Python", rust: "Rust", sql: "SQL", swift: "Swift", ts: "TypeScript", tsx: "TSX", yaml: "YAML",
};

interface EmbedHandlers { start: (ready: () => void) => void; finish: (url: string | null) => void }

/** Adds a YouTube or Gist link on its own line, which the published post embeds. */
function EmbedButton({ embed }: { embed: EmbedHandlers }) {
  const [open, setOpen] = useState(false);
  return <>
    <ButtonWithTooltip title="Embed a YouTube video or GitHub Gist" onClick={() => embed.start(() => setOpen(true))}><VideoFramePlayHorizontalIcon className="size-5" aria-hidden /></ButtonWithTooltip>
    <EmbedDialog open={open} onOpenChange={setOpen} onDone={embed.finish} />
  </>;
}

function Toolbar({ embed }: { embed: EmbedHandlers }) {
  return <DiffSourceToggleWrapper options={["rich-text", "source"]}>
    <UndoRedo />
    <Separator />
    <BlockTypeSelect />
    <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
    <StrikeThroughSupSubToggles options={["Strikethrough"]} />
    <CodeToggle />
    <Separator />
    <ListsToggle />
    <CreateLink />
    <InsertImage />
    <EmbedButton embed={embed} />
    <Separator />
    <InsertTable />
    <InsertCodeBlock />
    <InsertThematicBreak />
  </DiffSourceToggleWrapper>;
}

/**
 * Rich editing that reads and writes plain Markdown. Only syntax the published
 * renderer supports is offered: no underline, highlight or raw HTML.
 */
const MarkdownEditor = forwardRef<MDXEditorMethods, { value: string; onChange: (markdown: string, normalized: boolean) => void; labelledBy: string; describedBy?: string; invalid?: boolean }>(({ value, onChange, labelledBy, describedBy, invalid }, ref) => {
  const { resolvedTheme } = useTheme();
  const editor = useRef<MDXEditorMethods>(null);
  useImperativeHandle(ref, () => editor.current!, []);
  /**
   * Inserted content merges into the paragraph at the cursor, so clicking Embed
   * drops a placeholder at the cursor while it is still known. Choosing a link
   * rewrites the Markdown with the link on its own line; cancelling removes the
   * placeholder. The placeholder is never reported as the author's text. The
   * rewrite resets the cursor, so the editor lets go of focus rather than
   * sending the next keystrokes to the top of the post.
   */
  const group = useRef<HTMLDivElement>(null);
  const placeholder = useRef<string | null>(null);
  const embed = useRef<EmbedHandlers>({
    start: (ready) => {
      const target = editor.current;
      const content = group.current?.querySelector<HTMLElement>("[contenteditable='true']");
      const selection = window.getSelection();
      // Clicking the toolbar clears the editor's own selection but not the page's,
      // so the page's range is put back on the content for the editor to pick up.
      const range = selection?.rangeCount && content?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
      if (!target || !content || !selection || !range) return ready();
      const marker = `⟨embed ${crypto.randomUUID().slice(0, 8)}⟩`;
      placeholder.current = marker;
      content.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(range);
      window.setTimeout(() => { target.insertMarkdown(marker); ready(); });
    },
    finish: (url) => {
      const target = editor.current;
      const marker = placeholder.current;
      placeholder.current = null;
      if (!target) return;
      const next = placeEmbed(target.getMarkdown(), marker, url);
      if (next === null) return;
      target.setMarkdown(next);
      changed.current(next, false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".blog-editor")) active.blur();
    },
  });
  const changed = useRef(onChange);
  changed.current = (markdown, normalized) => {
    if (placeholder.current && markdown.includes(placeholder.current)) return;
    onChange(markdown, normalized);
  };
  const plugins = useMemo(() => [
    headingsPlugin({ allowedHeadingLevels: [2, 3, 4] }), listsPlugin(), quotePlugin(), thematicBreakPlugin(), linkPlugin(), linkDialogPlugin(),
    imagePlugin({ disableImageResize: true }), tablePlugin(), codeBlockPlugin({ defaultCodeBlockLanguage: "" }), codeMirrorPlugin({ codeBlockLanguages: LANGUAGES }),
    markdownShortcutPlugin(), diffSourcePlugin({ viewMode: "rich-text" }),
    toolbarPlugin({ toolbarContents: () => <Toolbar embed={embed.current} /> }),
  ], []);
  return <div ref={group} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
    <MDXEditor
      ref={editor}
      className={cn("blog-editor", resolvedTheme === "dark" && "dark-theme")}
      contentEditableClassName="blog-body blog-editor-content"
      markdown={value}
      onChange={(markdown, normalized) => changed.current(markdown, normalized)}
      plugins={plugins}
      suppressHtmlProcessing
      placeholder="Write your post. Use the toolbar or Markdown shortcuts like ## for a heading."
    />
  </div>;
});
MarkdownEditor.displayName = "MarkdownEditor";
export default MarkdownEditor;
