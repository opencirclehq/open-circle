import { useId, useRef, useState } from "react";
import { forumCategories, type ForumCommand, type ForumContent, type ForumDetail, type ForumKind, type ForumPoll } from "@shared/forum";
import { MetalButton } from "@/components/metal-button";
import { SharedSelect } from "@/components/ui/select";
import { ForumBody } from "./content";

export function ForumEditor({ initial, kind, admin = false, busy, onSave, onCancel }: { initial?: ForumDetail; kind?: ForumKind; admin?: boolean; busy: boolean; onSave: (command: ForumCommand) => Promise<boolean>; onCancel: () => void }) {
  const formId = useId();
  const saved = initial?.revision ?? initial?.content;
  const [value, setValue] = useState<ForumContent>(saved ?? { title: "", body: "", category: "General development" });
  const [withPoll, setWithPoll] = useState(!!initial?.poll);
  const [question, setQuestion] = useState(initial?.poll?.question ?? "");
  const [options, setOptions] = useState(initial?.poll?.options.map((o) => o.label) ?? ["", ""]);
  const [closesAt, setClosesAt] = useState(initial?.poll?.closesAt ? new Date(initial.poll.closesAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [preview, setPreview] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const pollFrozen = (initial?.poll?.total ?? 0) > 0;
  const isDiscussion = (initial?.kind ?? kind ?? (admin ? "discussion" : "question")) === "discussion";
  const directPublish = admin && isDiscussion;
  const change = (next: Partial<ForumContent>) => setValue((current) => ({ ...current, ...next }));
  async function save(publish: boolean) {
    if (submitting.current || busy) return;
    submitting.current = true;
    let poll: ForumPoll | null = null;
    if (withPoll) poll = { question, options: options.map((label, i) => ({ id: `option_${i + 1}`, label })), closesAt: closesAt ? new Date(closesAt).getTime() : null, closed: initial?.poll?.closed ?? false };
    if (pollFrozen && initial?.poll) poll = { question: initial.poll.question, options: initial.poll.options, closesAt: initial.poll.closesAt, closed: initial.poll.closed };
    try {
      await onSave({ action: initial ? "edit" : "create", requestId: requestId.current, ...(initial ? { id: initial.id, version: initial.version } : { kind: isDiscussion ? "discussion" : "question" }), content: value, ...(directPublish ? { publish, poll } : {}) });
    } finally { submitting.current = false; }
  }
  return <form className="space-y-4 rounded-2xl bg-foreground/[0.03] p-4 sm:p-5" onChange={() => { requestId.current = crypto.randomUUID(); }} onSubmit={(event) => { event.preventDefault(); void save(true); }}>
    <h2 className="text-lg font-medium">{initial ? "Edit" : isDiscussion ? "New discussion" : "Ask a question"}</h2>
    <label className="block space-y-2" htmlFor={`${formId}-title`}><span className="text-sm text-t2">Title</span><input className="field h-11" id={`${formId}-title`} value={value.title} onChange={(e) => change({ title: e.target.value })} minLength={5} maxLength={160} required disabled={busy} /></label>
    <label className="block space-y-2" htmlFor={`${formId}-body`}><span className="text-sm text-t2">{isDiscussion ? "Body" : "Explanation"}</span><textarea className="field min-h-44 rounded-2xl py-3" id={`${formId}-body`} value={value.body} onChange={(e) => change({ body: e.target.value })} minLength={15} maxLength={12000} required disabled={busy} aria-describedby={`${formId}-format`} /></label><p id={`${formId}-format`} className="text-xs text-t3">Markdown supports links, lists and fenced code blocks. Images and HTML are not displayed.</p>
    <label className="block space-y-2" htmlFor={`${formId}-category`}><span className="text-sm text-t2">Category</span><SharedSelect id={`${formId}-category`} value={value.category} onValueChange={(category) => { change({ category: category as ForumContent["category"] }); requestId.current = crypto.randomUUID(); }} options={forumCategories.map((category) => ({ label: category, value: category }))} disabled={busy} /></label>
    {directPublish && <fieldset className="space-y-3" disabled={busy || pollFrozen}>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={withPoll} onChange={(e) => setWithPoll(e.target.checked)} />Attach a poll</label>
      {withPoll && <>
        <label className="block space-y-2"><span className="text-sm text-t2">Poll question</span><input className="field h-11" value={question} onChange={(e) => setQuestion(e.target.value)} minLength={5} maxLength={240} required /></label>
        {options.map((option, i) => <label key={i} className="block space-y-2"><span className="text-sm text-t2">Option {i + 1}</span><input className="field h-11" value={option} onChange={(e) => setOptions(options.map((v, index) => index === i ? e.target.value : v))} maxLength={120} required /></label>)}
        <div className="flex gap-2"><button className="forum-action" type="button" disabled={options.length >= 6} onClick={() => { setOptions([...options, ""]); requestId.current = crypto.randomUUID(); }}>Add option</button><button className="forum-action" type="button" disabled={options.length <= 2} onClick={() => { setOptions(options.slice(0, -1)); requestId.current = crypto.randomUUID(); }}>Remove last option</button></div>
        <label className="block space-y-2"><span className="text-sm text-t2">Closes at (your local time, optional)</span><input type="datetime-local" className="field min-h-11" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></label>
      </>}
    </fieldset>}
    {pollFrozen && <p className="text-xs text-t3">Poll settings are fixed because voting has started.</p>}
    {!directPublish && <p className="text-sm text-t3">{initial?.publishedAt ? `Your approved ${isDiscussion ? "discussion" : "question"} stays visible while this edit awaits approval.` : `Only you and admins can see your ${isDiscussion ? "discussion" : "question"} until it is approved.`}</p>}
    {preview && <div className="space-y-3 py-3"><h3 className="text-base font-medium break-words">{value.title || "Preview"}</h3><ForumBody>{value.body || "Write an explanation to preview it."}</ForumBody></div>}
    <div className="flex flex-wrap items-center gap-2">
      <MetalButton type="submit" loading={busy} className="w-auto min-h-11">{directPublish ? initial?.publishedAt ? "Save changes" : "Publish" : initial ? "Submit revision" : "Submit for approval"}</MetalButton>
      {directPublish && !initial?.publishedAt && <button className="forum-action" type="button" disabled={busy} onClick={(e) => { if (e.currentTarget.form?.reportValidity()) void save(false); }}>Save draft</button>}
      <button className="forum-action" type="button" onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button>
      <button className="forum-action" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
