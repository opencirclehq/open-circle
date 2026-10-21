import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { forumAuthorName } from "@shared/forum";
import { blogQueues, blogReviewLabel, type BlogAuthor, type BlogCommand, type BlogDraft, type BlogQueue } from "@shared/blog";
import { MetalButton } from "@/components/metal-button";
import { Pagination } from "@/components/pagination";
import { Chip } from "@/components/panel";
import { ContentSkeleton } from "@/components/site-skeleton";
import { SharedSelect } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextureButton } from "@/components/ui/texture-button";
import { ApiError } from "@/lib/api";
import { blogApi } from "@/lib/blog-api";
import { BlogBody } from "./blog-body";
import { BlogDate, RepositoryCard } from "./blog-views";

const QUEUE_LABELS: Record<BlogQueue, string> = { pending: "Awaiting review", published: "Published", hidden: "Hidden", drafts: "Drafts and changes requested", rejected: "Not accepted", all: "All posts" };
type BlogAction = BlogCommand extends infer C ? C extends BlogCommand ? Omit<C, "requestId" | "id" | "version"> : never : never;
const signedOut = (error: unknown) => error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(error.code);

function Status({ post }: { post: BlogDraft }) {
  const live = !!post.published && !!post.slug;
  return <span className="flex flex-wrap items-center gap-2">
    {(post.review !== "approved" || post.revision) && <Chip tone={post.review === "pending" ? "warn" : "muted"}>{blogReviewLabel(post.review, live)}</Chip>}
    {live && !post.hidden && <Chip tone="ok">Live</Chip>}
    {post.hidden && <Chip tone="warn">Hidden</Chip>}
    {post.featured && <Chip tone="muted">Featured</Chip>}
  </span>;
}

export default function AdminBlog({ profile, onUnauthorized }: { profile: BlogAuthor; onUnauthorized: () => void }) {
  const [queue, setQueue] = useState<BlogQueue>("pending");
  const [page, setPage] = useState(1);
  const [id, setId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "blog", profile.id, "queue", queue, page], queryFn: ({ signal }) => blogApi.queue(queue, page, signal), enabled: !id, retry: false, gcTime: 0 });
  useEffect(() => { if (signedOut(list.error)) onUnauthorized(); }, [list.error, onUnauthorized]);
  if (id) return <Review key={id} id={id} profile={profile} onBack={() => setId(null)} onUnauthorized={onUnauthorized} />;
  return <section className="max-w-3xl space-y-5" aria-label="Blog review">
    <SharedSelect aria-label="Review queue" className="h-11 w-full sm:w-72" value={queue} onValueChange={(value) => { setQueue(value as BlogQueue); setPage(1); }} options={blogQueues.map((value) => ({ value, label: QUEUE_LABELS[value] }))} />
    {list.isPending ? <ContentSkeleton label="Loading blog posts…" /> : list.isError ? <div className="space-y-3" role="alert"><p className="text-sm text-t2">{list.error.message}</p><button className="forum-action" type="button" onClick={() => list.refetch()}>Try again</button></div> : <>
      {!list.data.items.length && <p className="py-9 text-sm text-t3">No posts in this queue.</p>}
      <ul className="divide-y divide-foreground/[0.08]">{list.data.items.map((post) => {
        const content = post.revision ?? post.published!;
        return <li key={post.id} className="space-y-2 py-5">
          <Status post={post} />
          <h3 className="break-words text-base font-medium [overflow-wrap:anywhere]"><button type="button" className="text-left hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" onClick={() => setId(post.id)}>{content.title}</button></h3>
          <p className="text-xs text-t3">{forumAuthorName(post.author)} · @{post.author.login} · {post.review === "pending" && post.submittedAt ? <>Submitted <BlogDate at={post.submittedAt} /></> : <>Updated <BlogDate at={post.updatedAt} /></>}</p>
        </li>;
      })}</ul>
      <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} label="Blog review" />
    </>}
  </section>;
}

function Review({ id, profile, onBack, onUnauthorized }: { id: string; profile: BlogAuthor; onBack: () => void; onUnauthorized: () => void }) {
  const field = useId();
  const client = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const detail = useQuery({ queryKey: ["admin", "blog", profile.id, "detail", id], queryFn: ({ signal }) => blogApi.review(id, signal), retry: false, gcTime: 0 });
  const [note, setNote] = useState("");
  const [version, setVersion] = useState<"submitted" | "live">("submitted");
  const mutation = useMutation({ mutationFn: (command: BlogCommand) => blogApi.command(command, true) });
  useEffect(() => { if (signedOut(detail.error)) onUnauthorized(); }, [detail.error, onUnauthorized]);
  async function act(command: BlogAction, done: string) {
    if (!detail.data) return;
    try {
      const next = await mutation.mutateAsync({ ...command, requestId: crypto.randomUUID(), id, version: detail.data.version } as BlogCommand);
      if (!alive.current) return;
      client.setQueryData(["admin", "blog", profile.id, "detail", id], next);
      void client.invalidateQueries({ queryKey: ["admin", "blog", profile.id, "queue"] });
      void client.invalidateQueries({ queryKey: ["blog"] });
      setNote("");
      toast.success(done);
    } catch (error) {
      if (!alive.current) return;
      if (signedOut(error)) onUnauthorized();
      if (error instanceof ApiError && error.status === 409) void detail.refetch();
      toast.error((error as Error).message);
    }
  }
  const post = detail.data;
  const busy = mutation.isPending;
  return <section className="max-w-3xl space-y-6" aria-label="Review blog post">
    <button className="forum-action" type="button" disabled={busy} onClick={onBack}>Back to queue</button>
    {detail.isPending ? <ContentSkeleton label="Loading the post…" detail /> : detail.isError ? <div className="space-y-3" role="alert"><p className="text-sm text-t2">{detail.error.message}</p><button className="forum-action" type="button" onClick={() => detail.refetch()}>Try again</button></div> : post && <>
      <div className="space-y-3">
        <Status post={post} />
        <p className="text-sm text-t3">By {forumAuthorName(post.author)} (@{post.author.login}){post.submittedAt && <> · Submitted <BlogDate at={post.submittedAt} /></>}{post.publishedAt && <> · Published <BlogDate at={post.publishedAt} /></>}</p>
        {post.slug && post.published && !post.hidden && <a className="text-sm text-t2 underline underline-offset-4" href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">View the live post<span className="sr-only"> (opens in a new tab)</span></a>}
      </div>
      {post.revision && post.published ? <Tabs value={version} onValueChange={(value) => setVersion(value as "submitted" | "live")}>
        <TabsList aria-label="Post version"><TabsTrigger className="min-h-11" value="submitted">{post.review === "pending" ? "Submitted changes" : "Working copy"}</TabsTrigger><TabsTrigger className="min-h-11" value="live">Live version</TabsTrigger></TabsList>
        <TabsContent value={version}><Content post={post} live={version === "live"} /></TabsContent>
      </Tabs> : <Content post={post} live={!post.revision} />}
      <div className="space-y-4 rounded-2xl bg-foreground/[0.04] p-4 sm:p-5">
        <label htmlFor={`${field}-note`} className="block text-sm text-t2">{post.review === "pending" ? "Note to the author" : "Moderation note"}</label>
        <textarea id={`${field}-note`} className="field min-h-24 rounded-2xl py-3" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} aria-describedby={`${field}-hint`} />
        <p id={`${field}-hint`} className="text-xs text-t3">{post.review === "pending" ? "Required when requesting changes or declining. The author sees it in Your posts." : "Required to hide a post. Kept in the audit trail."}</p>
        <div className="flex flex-wrap gap-2">
          {post.review === "pending" && <>
            <MetalButton className="min-h-11 w-auto" disabled={busy} onClick={() => void act({ action: "review", decision: "approve", reason: note }, post.published ? "Changes published." : "Post published.")}>{post.published ? "Approve changes" : "Approve and publish"}</MetalButton>
            <TextureButton variant="secondary" className="min-h-11 w-auto" disabled={busy} onClick={() => void act({ action: "review", decision: "changes", reason: note }, "Changes requested.")}>Request changes</TextureButton>
            <TextureButton variant="minimal" className="min-h-11 w-auto" disabled={busy} onClick={() => void act({ action: "review", decision: "reject", reason: note }, "Post declined.")}>Decline</TextureButton>
          </>}
          {post.published && <TextureButton variant="minimal" className="min-h-11 w-auto" disabled={busy} onClick={() => void act({ action: "moderate", operation: post.featured ? "unfeature" : "feature", reason: note }, post.featured ? "No longer featured." : "Featured.")}>{post.featured ? "Stop featuring" : "Feature"}</TextureButton>}
          <TextureButton variant="minimal" className="min-h-11 w-auto" disabled={busy} onClick={() => void act({ action: "moderate", operation: post.hidden ? "restore" : "hide", reason: note }, post.hidden ? "Post restored." : "Post hidden.")}>{post.hidden ? "Restore" : "Hide"}</TextureButton>
        </div>
      </div>
      {!!post.audit?.length && <section aria-label="Audit trail" className="space-y-3">
        <h3 className="text-sm font-medium">History</h3>
        <ol className="space-y-2 text-xs text-t3">{[...post.audit].reverse().map((entry) => <li key={entry.id} className="break-words">{entry.action.replace(/-/g, " ")} by @{entry.actor.login} · <BlogDate at={entry.at} />{entry.reason && <> · “{entry.reason}”</>}</li>)}</ol>
      </section>}
    </>}
  </section>;
}

function Content({ post, live }: { post: BlogDraft; live: boolean }) {
  const content = live ? post.published! : post.revision ?? post.published!;
  return <article className="space-y-4 rounded-2xl border border-foreground/[0.08] p-5">
    <p className="text-xs text-t3">{content.topic}</p>
    <h2 className="break-words text-2xl font-medium tracking-[-0.03em] [overflow-wrap:anywhere]">{content.title}</h2>
    <p className="break-words text-t2">{content.summary}</p>
    {content.canonicalUrl && <p className="break-words text-sm text-t3">Originally published at <a className="text-t2 underline underline-offset-4" href={content.canonicalUrl} target="_blank" rel="noopener noreferrer">{content.canonicalUrl}</a></p>}
    <BlogBody>{content.body}</BlogBody>
    {content.repository && <RepositoryCard repository={content.repository} />}
  </article>;
}
