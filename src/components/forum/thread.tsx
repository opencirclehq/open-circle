import { useEffect, useRef, useState } from "react";
import type { ForumAuthor, ForumCommand, ForumDetail, ForumPollView } from "@shared/forum";
import { forumAuthorName, reviewLabel } from "@shared/forum";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeftIcon, CheckCircleIcon, ClockCircleIcon, CloseCircleIcon, LockKeyholeIcon, PenIcon, RestartIcon } from "@solar-icons/react/linear";
import { Chip } from "@/components/panel";
import { MetalButton } from "@/components/metal-button";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { ForumBody, ForumTime } from "./content";
import { ForumEditor } from "./editor";
import { ForumAuthorLine } from "./author-line";
import { ForumPostActions } from "./post-actions";
import { ForumComments } from "./comments";

function Poll({ value, busy, onVote }: { value: ForumPollView; busy: boolean; onVote: (optionId: string, requestId: string) => Promise<boolean> }) {
  const [choice, setChoice] = useState(value.selected ?? "");
  const requestId = useRef(crypto.randomUUID());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!value.closesAt || !value.open || value.closesAt <= now) return;
    const remaining = value.closesAt - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(remaining, 0), 2147483647));
    return () => window.clearTimeout(timer);
  }, [value.closesAt, value.open, now]);
  const open = value.open && (value.closesAt === null || value.closesAt > now);
  return <form className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (open && choice) void onVote(choice, requestId.current); }}>
    <fieldset disabled={busy || !open} className="space-y-2">
      <legend className="mb-3 text-base font-medium">{value.question}</legend>
      {value.options.map((option) => {
        const count = value.counts[option.id] ?? 0;
        const percent = value.total ? Math.round(count * 100 / value.total) : 0;
        return <label key={option.id} className="relative flex min-h-12 cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2 ring-1 ring-inset ring-foreground/10 focus-within:ring-2 focus-within:ring-foreground/50">
          <span aria-hidden className="absolute inset-y-0 left-0 bg-foreground/[0.06]" style={{ width: `${percent}%` }} />
          <input type="radio" name="poll-option" value={option.id} checked={choice === option.id} onChange={() => { setChoice(option.id); requestId.current = crypto.randomUUID(); }} className="relative shrink-0 accent-foreground" />
          <span className="relative min-w-0 flex-1 break-words text-sm">{option.label}{value.selected === option.id && <span className="ml-2 text-xs text-t3">Your vote</span>}</span>
          <span className="relative text-xs tabular text-t2">{count} · {percent}%</span>
        </label>;
      })}
    </fieldset>
    <p className="text-xs text-t3" role="status">{open ? "Open" : "Closed"} · {value.total ? `${value.total} ${value.total === 1 ? "vote" : "votes"}` : "No votes yet"}{value.closesAt ? <> · {open ? "Closes" : "Closing time"} <ForumTime at={value.closesAt} /></> : ""}</p>
    {open && <MetalButton type="submit" className="min-h-11 w-auto" loading={busy} disabled={!choice || choice === value.selected}>{value.selected ? "Change vote" : "Vote"}</MetalButton>}
    <p className="text-xs text-t3">One vote per GitHub account. Other members see totals, not your choice.</p>
  </form>;
}
export function ForumThreadView({ data, profile, admin = false, busy, onAction, onPage }: { data: ForumDetail; profile: ForumAuthor; admin?: boolean; busy: boolean; onAction: (command: ForumCommand) => Promise<boolean>; onPage: (page: number) => void }) {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (hash !== "#comments") return;
    document.getElementById("comments")?.scrollIntoView?.({ block: "start" });
    (document.getElementById("forum-comment") ?? document.getElementById("comments"))?.focus({ preventScroll: true });
  }, [hash, key, data.id]);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState<string | null | undefined>(undefined);
  const [reportReason, setReportReason] = useState("");
  const [reason, setReason] = useState("");
  const reportRequestId = useRef(crypto.randomUUID());
  const own = profile.id === data.author.id;
  const status = reviewLabel(data.review, data.hasRevision);
  async function send(patch: Omit<ForumCommand, "requestId" | "id">, id: string = crypto.randomUUID()) {
    return onAction({ ...patch, id: data.id, requestId: id });
  }
  const moderate = (operation: ForumCommand["operation"], extra: Partial<ForumCommand> = {}) => send({ action: "moderate", operation, version: data.version, reason, ...extra });
  return <article className="min-w-0 space-y-6">
    <Link className="forum-action inline-flex items-center gap-2" to={`/community?tab=${data.kind === "question" ? "questions" : "discussions"}`}><ArrowLeftIcon className="size-4" aria-hidden />Back to {data.kind === "question" ? "questions" : "discussions"}</Link>
    <header className="space-y-3">
      <div className="flex flex-wrap gap-2">{data.pinned && <Chip tone="muted">Pinned</Chip>}{data.locked && <Chip tone="muted" icon={<LockKeyholeIcon />}>Comments locked</Chip>}{data.hidden && <Chip tone="warn">Hidden</Chip>}{data.kind === "question" && data.publishedAt && <Chip tone={data.resolved ? "ok" : "muted"} icon={data.resolved ? <CheckCircleIcon /> : <ClockCircleIcon />}>{data.resolved ? "Resolved" : "Open"}</Chip>}{status && <Chip tone="warn">{status}</Chip>}</div>
      <div className="forum-post-header"><ForumAuthorLine author={data.author} at={data.publishedAt ?? data.createdAt} edited={data.edited} /><span className="forum-category">{data.content.category}</span></div>
      <h2 className="break-words text-2xl font-medium tracking-[-0.03em] [overflow-wrap:anywhere]">{data.content.title}</h2>
    </header>
    <ForumBody>{data.content.body}</ForumBody>
    {data.publishedAt && !data.hidden && <ForumPostActions post={data} busy={busy} onLike={(liked) => { void send({ action: "like", liked }); }} />}
    {data.reviewReason && <p className="rounded-xl bg-foreground/[0.04] p-3 text-sm text-t2">Private review note: {data.reviewReason}</p>}
    {data.revision && data.publishedAt && <details className="rounded-xl bg-foreground/[0.03] p-4"><DisclosureSummary className="text-sm font-medium">{admin ? "Proposed revision" : "Your proposed revision"}</DisclosureSummary><h3 className="mb-3 mt-4 break-words font-medium">{data.revision.title}</h3><ForumBody>{data.revision.body}</ForumBody></details>}
    <div className="flex flex-wrap gap-2">
      {(admin || own) && <button className="forum-action forum-action-filled" type="button" disabled={busy} aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? <CloseCircleIcon className="size-4 shrink-0" aria-hidden /> : <PenIcon className="size-4 shrink-0" aria-hidden />}{editing ? "Close editor" : "Edit"}</button>}
      {data.kind === "question" && data.publishedAt && (admin || own) && <button className="forum-action forum-action-filled" type="button" disabled={busy || admin && reason.trim().length < 3} onClick={() => void moderate(data.resolved ? "unresolve" : "resolve", { reason: admin ? reason : undefined })}>{data.resolved ? <RestartIcon className="size-4 shrink-0" aria-hidden /> : <CheckCircleIcon className="size-4 shrink-0" aria-hidden />}{data.resolved ? "Reopen question" : "Mark resolved"}</button>}
      {data.publishedAt && !data.hidden && <button className="forum-action forum-action-report" type="button" disabled={busy} onClick={() => { setReporting(null); setReportReason(""); reportRequestId.current = crypto.randomUUID(); }}>Report post</button>}
    </div>
    {editing && <ForumEditor key={data.id} initial={data} admin={admin} busy={busy} onCancel={() => setEditing(false)} onSave={async (input) => { const saved = await onAction(input); if (saved) setEditing(false); return saved; }} />}
    {data.poll && <Poll key={`${data.id}:${data.poll.selected}:${data.poll.open}`} value={data.poll} busy={busy} onVote={(optionId, requestId) => send({ action: "vote", optionId, ballot: data.poll!.ballot }, requestId)} />}
    {reporting !== undefined && <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: "report", commentId: reporting, reason: reportReason }, reportRequestId.current)) { setReporting(undefined); setReportReason(""); } }}><label className="block space-y-2"><span className="text-sm">Why are you reporting this?</span><textarea className="field min-h-24 rounded-2xl py-3" value={reportReason} minLength={5} maxLength={1000} required onChange={(e) => { setReportReason(e.target.value); reportRequestId.current = crypto.randomUUID(); }} disabled={busy} /></label><MetalButton type="submit" className="min-h-11 w-auto" loading={busy}>Send report</MetalButton><button type="button" className="forum-action" disabled={busy} onClick={() => setReporting(undefined)}>Cancel report</button></form>}
    {admin && <section className="space-y-4 rounded-2xl bg-foreground/[0.03] p-4" aria-label="Moderation">
      <h3 className="font-medium">Moderation</h3>
      <p className="text-xs text-t3">Submitted <ForumTime at={data.submittedAt ?? data.createdAt} /> · Version {data.version}</p>
      <label className="block space-y-2"><span className="text-sm text-t2">Private reason or review note</span><textarea className="field min-h-24 rounded-2xl py-3" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
      <div className="flex flex-wrap gap-2">
        {data.review === "pending" && <>{([['approve', 'Approve'], ['changes', 'Request changes'], ['reject', 'Reject']] as const).map(([decision, label]) => <button type="button" className="forum-action forum-action-filled" key={decision} disabled={busy || decision !== "approve" && reason.trim().length < 5} onClick={() => void send({ action: "review", decision, reason, version: data.version })}>{label}</button>)}</>}
        {([[data.hidden ? "restore" : "hide", data.hidden ? "Restore post" : "Hide post"], [data.locked ? "reopen" : "lock", data.locked ? "Reopen comments" : "Lock comments"], [data.pinned ? "unpin" : "pin", data.pinned ? "Unpin" : "Pin"]] as const).map(([op, label]) => <button className="forum-action forum-action-filled" type="button" key={op} disabled={busy || reason.trim().length < 3} onClick={() => void moderate(op)}>{label}</button>)}
        {data.poll?.open && <button className="forum-action forum-action-filled" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate("close-poll")}>Close voting</button>}
      </div>
      {!!data.reports?.length && <div className="space-y-3"><h4 className="text-sm font-medium">Reports</h4>{data.reports.map((r) => <div key={r.id} className="text-sm text-t2"><p>{forumAuthorName(r.author)} · <ForumTime at={r.createdAt} /> · {r.commentId ? `Comment ${r.commentId}` : "Post"} · {r.resolved ? "Reviewed" : "Open"}</p><p className="break-words">{r.reason}</p>{r.reportedComment && <div className="space-y-2 py-3"><p className="text-xs text-t3">Reported comment by {forumAuthorName(r.reportedComment.author)} · <ForumTime at={r.reportedComment.createdAt} />{r.reportedComment.hidden ? " · Hidden" : ""}</p><ForumBody>{r.reportedComment.body}</ForumBody><button className="forum-action forum-action-filled" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate(r.reportedComment!.hidden ? "restore-comment" : "hide-comment", { commentId: r.commentId })}>{r.reportedComment.hidden ? "Restore reported comment" : "Hide reported comment"}</button></div>}{!r.resolved && <button className="forum-action forum-action-filled" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate("dismiss-report", { reportId: r.id })}>Mark report reviewed</button>}</div>)}</div>}
      <details><DisclosureSummary className="py-3 text-sm">Moderation history</DisclosureSummary><ol className="space-y-4">{data.audit?.map((a) => <li key={a.id} className="break-words text-xs text-t3"><p>{forumAuthorName(a.actor)} · {a.action} · <ForumTime at={a.at} /></p>{a.reason && <p className="mt-1 text-sm text-t2">{a.reason}</p>}{a.content && <details className="mt-2"><DisclosureSummary>Submitted content</DisclosureSummary><p className="my-2 font-medium">{a.content.title}</p><ForumBody>{a.content.body}</ForumBody></details>}</li>)}</ol></details>
    </section>}
    {data.publishedAt && <ForumComments data={data} profile={profile} admin={admin} busy={busy} reason={reason} send={send} onPage={onPage} onModerate={(comment) => { void moderate(comment.hidden ? "restore-comment" : "hide-comment", { commentId: comment.id }); }} />}
  </article>;
}
