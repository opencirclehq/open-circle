import { lazy, Suspense, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { toast } from "sonner";
import { BLOG_LIMITS, blogReviewLabel, blogTopics, validateBlogContent, type BlogContent, type BlogContentInput, type BlogDraft, type BlogTopic } from "@shared/blog";
import { blogMarkdownProblem } from "@shared/blog-markdown";
import { MetalButton } from "@/components/metal-button";
import { Chip } from "@/components/panel";
import { ContentSkeleton } from "@/components/site-skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { guardedLeave, setLeaveGuard } from "@/lib/leave-guard";
import { formatFull } from "@/lib/format";
import { BlogBody } from "./blog-body";

const MarkdownEditor = lazy(() => import("./markdown-editor"));

/** The form keeps text as typed; nothing is chosen for the author, including the topic. */
interface BlogForm { title: string; summary: string; topic: BlogTopic | ""; body: string; canonicalUrl: string; repository: string }
type Field = keyof BlogForm;

function toForm(content: BlogContent | null): BlogForm {
  return content
    ? { title: content.title, summary: content.summary, topic: content.topic, body: content.body, canonicalUrl: content.canonicalUrl ?? "", repository: content.repository?.url ?? "" }
    : { title: "", summary: "", topic: "", body: "", canonicalUrl: "", repository: "" };
}

/** Empty optional links are sent as null: the post has none. */
function toInput(form: BlogForm) {
  return { ...form, canonicalUrl: form.canonicalUrl.trim() || null, repository: form.repository.trim() || null };
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`text-xs tabular ${value.length > max ? "text-[hsl(var(--down))]" : "text-t3"}`}>{formatFull(value.length)} / {formatFull(max)}</span>;
}

export function BlogComposer({ initial, busy, onSave, onLeave }: { initial?: BlogDraft; busy: boolean; onSave: (action: "save" | "submit", content: BlogContentInput) => Promise<boolean>; onLeave: () => void }) {
  const id = useId();
  const start = toForm(initial?.revision ?? initial?.published ?? null);
  const [form, setForm] = useState<BlogForm>(start);
  const [baseline, setBaseline] = useState<BlogForm>(start);
  const [invalid, setInvalid] = useState<Field | null>(null);
  const [preview, setPreview] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const editor = useRef<MDXEditorMethods>(null);
  const pendingLeave = useRef<(() => void) | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const body = useDeferredValue(form.body);
  const problem = useMemo(() => body.trim() ? blogMarkdownProblem(body) : null, [body]);
  const change = (next: Partial<BlogForm>) => { setForm((current) => ({ ...current, ...next })); setInvalid(null); };
  // The editor rewrites the starting Markdown into its canonical form once; that isn't an edit.
  const editBody = (value: string, normalized: boolean) => {
    if (normalized) setBaseline((current) => form.body === current.body ? { ...current, body: value } : current);
    change({ body: value });
  };

  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) { setLeaveGuard(null); return; }
    setLeaveGuard((proceed) => { pendingLeave.current = proceed; setLeaving(true); return true; });
    return () => setLeaveGuard(null);
  }, [dirty]);

  function refuse(field: Field, error: string) {
    setInvalid(field);
    toast.error(error, { id: "blog-composer" });
    if (field === "body") { setPreview(false); editor.current?.focus(); }
    else document.getElementById(`${id}-${field}`)?.focus();
  }

  async function save(action: "save" | "submit") {
    const checked = validateBlogContent(toInput(form), action === "submit");
    if (!checked.ok) return refuse(checked.field, checked.error);
    const issue = action === "submit" ? blogMarkdownProblem(checked.value.body) : null;
    if (issue) return refuse("body", issue);
    if (await onSave(action, checked.value)) setBaseline(form);
  }

  const live = !!initial?.published;
  const status = initial && (initial.review !== "approved" || initial.revision) ? blogReviewLabel(initial.review, live) : null;
  const fieldProps = (field: Field, hint?: boolean) => ({ id: `${id}-${field}`, "aria-invalid": invalid === field || undefined, ...(hint ? { "aria-describedby": `${id}-${field}-hint` } : {}) });
  // Dialogs inside the editor (links, embeds) are forms too, and React bubbles their submits here.
  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (event.target === event.currentTarget) void save("submit"); }} aria-busy={busy}>
    {initial && <div className="space-y-2" role="status">
      {status && <Chip tone={initial.review === "changes" || initial.review === "rejected" ? "warn" : "muted"}>{status}</Chip>}
      {initial.reviewReason && (initial.review === "changes" || initial.review === "rejected") && <p className="max-w-prose whitespace-pre-line break-words text-sm text-t2"><span className="font-medium text-foreground">Note from the reviewer: </span>{initial.reviewReason}</p>}
      {live && <p className="text-sm text-t3">Your published version stays live until an admin approves these changes.</p>}
    </div>}
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3"><label htmlFor={`${id}-title`} className="text-sm text-t2">Title</label><Counter value={form.title} max={BLOG_LIMITS.title.max} /></div>
      <input {...fieldProps("title")} className="field h-12 text-base" value={form.title} maxLength={BLOG_LIMITS.title.max + 20} onChange={(event) => change({ title: event.target.value })} placeholder="What's the post about?" />
    </div>
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3"><label htmlFor={`${id}-summary`} className="text-sm text-t2">Summary</label><Counter value={form.summary} max={BLOG_LIMITS.summary.max} /></div>
      <textarea {...fieldProps("summary", true)} className="field min-h-24 rounded-2xl py-3" value={form.summary} maxLength={BLOG_LIMITS.summary.max + 40} onChange={(event) => change({ summary: event.target.value })} />
      <p id={`${id}-summary-hint`} className="text-xs text-t3">One or two sentences. It appears in the post list and link previews.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-topic`} className="block text-sm text-t2">Topic</label>
      <SharedSelect {...fieldProps("topic")} className="h-11 w-full sm:w-64" value={form.topic} placeholder="Choose a topic" onValueChange={(topic) => change({ topic: topic as BlogTopic })} options={blogTopics.map((topic) => ({ value: topic, label: topic }))} />
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={`${id}-body-label`} className="text-sm text-t2">Post</span>
        <div className="flex items-center gap-3"><Counter value={form.body} max={BLOG_LIMITS.body.max} /><button type="button" className="forum-action" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Back to editing" : "Preview as published"}</button></div>
      </div>
      {preview ? <article className="rounded-[18px] bg-foreground/[0.035] px-5 py-6" aria-label="Preview">
        <h2 className="mb-6 break-words text-2xl font-medium tracking-[-0.03em] text-foreground">{form.title || "Untitled post"}</h2>
        {form.body.trim() ? <BlogBody>{form.body}</BlogBody> : <p className="text-sm text-t3">Nothing to preview yet.</p>}
      </article> : <Suspense fallback={<ContentSkeleton label="Loading the editor…" detail />}>
        <MarkdownEditor ref={editor} value={form.body} onChange={editBody} labelledBy={`${id}-body-label`} describedBy={`${id}-body-hint`} invalid={invalid === "body"} />
      </Suspense>}
      {problem && <p role="status" className="text-sm text-[hsl(var(--warn))]">{problem} Fix it before submitting; the source view (the Markdown button in the toolbar) shows the exact text.</p>}
      <p id={`${id}-body-hint`} className="text-xs text-t3">At least {formatFull(BLOG_LIMITS.body.min)} characters to submit. A YouTube or GitHub Gist link on its own line becomes an embed.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-repository`} className="block text-sm text-t2">Related repository <span className="text-t3">(optional)</span></label>
      <input {...fieldProps("repository", true)} type="url" inputMode="url" className="field h-11" value={form.repository} onChange={(event) => change({ repository: event.target.value })} placeholder="https://github.com/owner/project" />
      <p id={`${id}-repository-hint`} className="text-xs text-t3">A public repository on GitHub, GitLab or Bitbucket. We check that it exists when you save.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-canonicalUrl`} className="block text-sm text-t2">Originally published at <span className="text-t3">(optional)</span></label>
      <input {...fieldProps("canonicalUrl", true)} type="url" inputMode="url" className="field h-11" value={form.canonicalUrl} onChange={(event) => change({ canonicalUrl: event.target.value })} placeholder="https://yourblog.dev/first-pull-request" />
      <p id={`${id}-canonicalUrl-hint`} className="text-xs text-t3">If this post first appeared elsewhere, search engines will credit that address instead of OpenCircle.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <MetalButton type="submit" className="min-h-11 w-auto" innerClassName="px-5" disabled={busy}>{live ? "Submit changes for review" : "Submit for review"}</MetalButton>
      <TextureButton type="button" variant="secondary" className="min-h-11 w-auto" disabled={busy || (!dirty && !!initial)} onClick={() => void save("save")}>Save draft</TextureButton>
      <button type="button" className="forum-action" disabled={busy} onClick={() => guardedLeave(onLeave)}>Cancel</button>
      {dirty && <span className="text-xs text-t3" role="status">Unsaved changes</span>}
    </div>
    <Dialog open={leaving} onOpenChange={(open) => { if (!open) setLeaving(false); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>Leave your unsaved changes?</DialogTitle>
        <DialogDescription>Save a draft first if you want to keep them.</DialogDescription>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <TextureButton type="button" variant="secondary" className="w-auto" onClick={() => setLeaving(false)}>Keep editing</TextureButton>
          <TextureButton type="button" className="w-auto" onClick={() => { setLeaving(false); const proceed = pendingLeave.current; pendingLeave.current = null; setLeaveGuard(null); proceed?.(); }}>Leave without saving</TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  </form>;
}
