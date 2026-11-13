import { useEffect, useRef, useState, type FormEvent } from "react";
import { HeartIcon as LikedHeartIcon } from "@solar-icons/react/bold";
import { ChatRoundIcon, FlagIcon, HeartIcon, LockKeyholeIcon, Plane2Icon, ReplyIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { forumAuthorName, FORUM_PAGE_SIZE, type ForumAuthor, type ForumCommand, type ForumCommentView, type ForumDetail } from "@shared/forum";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination } from "@/components/pagination";
import { ForumBody, ForumTime } from "./content";

type Send = (command: Omit<ForumCommand, "requestId" | "id">, requestId?: string) => Promise<boolean>;

function CommentAvatar({ author }: { author: ForumAuthor }) {
  return <Avatar className="forum-comment-avatar"><AvatarImage src={author.avatarUrl} alt="" loading="lazy" /><AvatarFallback className="text-xs font-medium text-t2" aria-hidden>{author.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>;
}

function CommentComposer({ profile, replyTo, body, busy, posting, onChange, onSubmit, onCancel }: { profile: ForumAuthor; replyTo?: ForumCommentView; body: string; busy: boolean; posting: boolean; onChange: (body: string) => void; onSubmit: (event: FormEvent) => void; onCancel?: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const replyId = replyTo?.id;
  useEffect(() => { if (replyId) field.current?.focus(); }, [replyId]);
  const id = replyTo ? `reply-${replyTo.id}` : "forum-comment";
  return <form className={`forum-composer${replyTo ? " forum-reply-composer" : ""}`} onSubmit={onSubmit} aria-label={replyTo ? `Reply to ${forumAuthorName(replyTo.author)}` : "Add a comment"} aria-busy={posting}>
    <CommentAvatar author={profile} />
    <div className="forum-composer-field">
      {replyTo && <p className="forum-reply-context">Replying to {forumAuthorName(replyTo.author)}</p>}
      <label htmlFor={id} className="sr-only">{replyTo ? "Your reply" : "Your comment"}</label>
      <textarea ref={field} id={id} value={body} placeholder={replyTo ? "Write a reply…" : "Add to the conversation…"} onChange={(event) => onChange(event.target.value)} maxLength={6000} required disabled={posting} rows={3} />
      <div className="forum-composer-footer">
        <span className="forum-composer-hint">Markdown supported</span>
        <div className="forum-composer-actions">
          {onCancel && <button type="button" className="forum-action" disabled={posting} onClick={onCancel}>Cancel reply</button>}
          <button type="submit" className="forum-comment-submit" disabled={busy || !body.trim()}><Plane2Icon className="size-4 shrink-0" aria-hidden />{posting ? "Posting…" : replyTo ? "Post reply" : "Comment"}</button>
        </div>
      </div>
    </div>
  </form>;
}

function CommentReport({ busy, send, onClose }: { busy: boolean; send: (reason: string, requestId: string) => Promise<boolean>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  return <form className="forum-comment-report" aria-label="Report comment" aria-busy={sending} onSubmit={async (event) => {
    event.preventDefault();
    if (busy || submitting.current || reason.trim().length < 5) return;
    submitting.current = true;
    setSending(true);
    try { if (await send(reason, requestId.current)) onClose(); }
    finally { submitting.current = false; setSending(false); }
  }}>
    <label className="block space-y-2"><span className="text-sm font-medium">Why are you reporting this comment?</span><textarea ref={field} className="field min-h-24 rounded-xl py-3" value={reason} minLength={5} maxLength={1000} required disabled={sending} onChange={(event) => { setReason(event.target.value); requestId.current = crypto.randomUUID(); }} /></label>
    <div className="flex flex-wrap gap-2"><button type="submit" className="forum-comment-submit" disabled={busy || sending || reason.trim().length < 5}>{sending ? "Sending…" : "Send report"}</button><button type="button" className="forum-action" disabled={busy || sending} onClick={onClose}>Cancel report</button></div>
  </form>;
}

export function ForumComments({ data, profile, admin, busy, reason, send, onPage, onModerate }: { data: ForumDetail; profile: ForumAuthor; admin: boolean; busy: boolean; reason: string; send: Send; onPage: (page: number) => void; onModerate: (comment: ForumCommentView) => void }) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<string | null>(null);
  const requestIds = useRef<Record<string, string>>({});
  const submitting = useRef(false);
  const roots = data.comments.filter((comment) => !comment.parentId);
  const updateDraft = (key: string, body: string) => { setDrafts((current) => ({ ...current, [key]: body })); requestIds.current[key] = crypto.randomUUID(); };
  const closeReply = (id: string) => { setReplyTo(null); document.getElementById(`reply-button-${id}`)?.focus(); };
  const closeReport = (id: string) => { setReporting(null); document.getElementById(`report-button-${id}`)?.focus(); };
  async function post(event: FormEvent, parentId: string | null) {
    event.preventDefault();
    const key = parentId ?? "comment";
    if (busy || submitting.current || !drafts[key]?.trim()) return;
    submitting.current = true;
    setPosting(key);
    requestIds.current[key] ??= crypto.randomUUID();
    try {
      if (await send({ action: "comment", body: drafts[key], parentId }, requestIds.current[key])) {
        updateDraft(key, "");
        if (parentId) closeReply(parentId);
        toast.success(parentId ? "Reply posted." : "Comment posted.");
      }
    } finally { submitting.current = false; setPosting(null); }
  }
  function renderComment(comment: ForumCommentView, parentHidden = false) {
    const Heart = comment.liked ? LikedHeartIcon : HeartIcon;
    const unavailable = comment.hidden || parentHidden;
    const author = forumAuthorName(comment.author);
    return <article id={`comment-${comment.id}`} className="forum-comment" aria-label={`Comment by ${author}`}>
      <CommentAvatar author={comment.author} />
      <div className="forum-comment-main">
        <header className="forum-comment-header"><span className="forum-comment-author">{author}</span><span className="forum-comment-time"><ForumTime at={comment.createdAt} /></span>{comment.hidden && <span className="text-xs text-t3">Hidden</span>}</header>
        <ForumBody>{comment.body}</ForumBody>
        <div className="forum-comment-actions" role="group" aria-label={`Actions for comment by ${author}`}>
          <button type="button" className="forum-comment-action forum-comment-like" aria-label={`${comment.liked ? "Unlike" : "Like"} comment by ${author}`} aria-pressed={comment.liked} aria-describedby={`comment-likes-${comment.id}`} disabled={busy || unavailable} onClick={() => { void send({ action: "like", commentId: comment.id, liked: !comment.liked }); }}><Heart className="size-4 shrink-0" aria-hidden /><span>{comment.liked ? "Liked" : "Like"}</span><span id={`comment-likes-${comment.id}`} className="forum-comment-like-count">{comment.likeCount}<span className="sr-only"> {comment.likeCount === 1 ? "like" : "likes"}</span></span></button>
          {!comment.parentId && !unavailable && !data.locked && <button id={`reply-button-${comment.id}`} type="button" className="forum-comment-action" disabled={busy} aria-expanded={replyTo === comment.id} aria-controls={replyTo === comment.id ? `reply-${comment.id}` : undefined} onClick={() => { setReplyTo(comment.id); document.getElementById(`reply-${comment.id}`)?.focus(); }}><ReplyIcon className="size-4 shrink-0" aria-hidden />Reply</button>}
          <button id={`report-button-${comment.id}`} type="button" className="forum-comment-action forum-comment-report-action" aria-label={`Report comment by ${author}`} aria-expanded={reporting === comment.id} disabled={busy || unavailable} onClick={() => setReporting(comment.id)}><FlagIcon className="size-4 shrink-0" aria-hidden /><span>Report</span></button>
          {admin && <button type="button" className="forum-action" disabled={busy || reason.trim().length < 3} onClick={() => onModerate(comment)}>{comment.hidden ? "Restore comment" : "Hide comment"}</button>}
        </div>
        {reporting === comment.id && <CommentReport key={comment.id} busy={busy} send={(reason, requestId) => send({ action: "report", commentId: comment.id, reason }, requestId)} onClose={() => closeReport(comment.id)} />}
      </div>
    </article>;
  }
  return <section id="comments" tabIndex={-1} className="forum-comments" aria-labelledby="comments-heading">
    <h3 id="comments-heading" className="forum-comments-heading"><ChatRoundIcon className="size-5 shrink-0" aria-hidden />Comments <span className="forum-comments-count">{data.commentCount}</span></h3>
    {data.locked ? <p className="forum-comments-locked"><LockKeyholeIcon className="size-4 shrink-0" aria-hidden />Comments are locked.</p> : <CommentComposer profile={profile} body={drafts.comment ?? ""} busy={busy} posting={posting === "comment"} onChange={(body) => updateDraft("comment", body)} onSubmit={(event) => { void post(event, null); }} />}
    {!data.comments.length && <p className="forum-comments-empty">No comments yet.</p>}
    <ol className="forum-comment-list">{roots.map((root) => {
      const replies = data.comments.filter((comment) => comment.parentId === root.id);
      return <li key={root.id} className="forum-comment-thread">
        {renderComment(root)}
        {!!replies.length && <ol className="forum-comment-replies" aria-label={`Replies to ${forumAuthorName(root.author)}`}>{replies.map((reply) => <li key={reply.id}>{renderComment(reply, root.hidden)}</li>)}</ol>}
        {replyTo === root.id && !data.locked && !root.hidden && <CommentComposer profile={profile} replyTo={root} body={drafts[root.id] ?? ""} busy={busy} posting={posting === root.id} onChange={(body) => updateDraft(root.id, body)} onSubmit={(event) => { void post(event, root.id); }} onCancel={() => closeReply(root.id)} />}
      </li>;
    })}</ol>
    <Pagination page={data.commentPage} pageSize={FORUM_PAGE_SIZE} total={data.commentTotal} label="Comments" onPageChange={(page) => { setReplyTo(null); setReporting(null); onPage(page); }} disabled={busy} />
  </section>;
}
