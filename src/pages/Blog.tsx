import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NotebookBookmarkIcon } from "@solar-icons/react/bold-duotone";
import { PenNewSquareIcon } from "@solar-icons/react/linear";
import { blogReviewLabel, blogTopics, type BlogContentInput, type BlogDraft } from "@shared/blog";
import { blogSeoDocument } from "@shared/blog-seo";
import { AccountCorner } from "@/components/account-corner";
import { BlogComposer } from "@/components/blog/blog-composer";
import { BlogArticleView, BlogCard, BlogDate } from "@/components/blog/blog-views";
import { GitHubIcon } from "@/components/brand-icons";
import { Dock } from "@/components/dock";
import { MetalButton } from "@/components/metal-button";
import { Pagination } from "@/components/pagination";
import { Chip } from "@/components/panel";
import { SiteFooter } from "@/components/site-footer";
import { ContentSkeleton } from "@/components/site-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { useCommunity } from "@/hooks/use-community";
import { applyPageMeta, currentOrigin, usePageMeta } from "@/hooks/use-page-meta";
import { ApiError } from "@/lib/api";
import { blogApi } from "@/lib/blog-api";
import { retryApiQuery } from "@/lib/query-policy";

type View = "list" | "post" | "mine" | "write";

export default function Blog({ view = "list" }: { view?: View }) {
  usePageMeta();
  const { pathname } = useLocation();
  return <div className="relative min-h-dvh overflow-x-clip">
    <div className="app-backdrop" aria-hidden />
    <AccountCorner />
    <main className="page-container relative z-10 min-w-0 pb-10 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-28">
      <div className="mx-auto max-w-3xl">
        {view === "post" ? <Post /> : view === "mine" ? <Members returnTo="/blog/mine"><MyPosts /></Members> : view === "write" ? <Members returnTo={pathname}><Write /></Members> : <List />}
      </div>
    </main>
    <SiteFooter />
    <Dock />
  </div>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="flex min-h-11 items-center pr-28 text-[22px] font-medium tracking-[-0.03em] min-[360px]:text-2xl sm:min-h-0 sm:pr-0 sm:text-3xl">{children}</h1>;
}

function Failure({ error, retry }: { error: Error; retry: () => void }) {
  const membership = error instanceof ApiError && error.code === "blog_membership";
  return <div role="alert" className="space-y-3 py-6">
    <p className="max-w-lg text-sm text-t2">{error.message}</p>
    {membership ? <Link to="/participation#start" className="forum-action inline-flex items-center">Verify membership</Link> : <button type="button" className="forum-action" onClick={retry}>Try again</button>}
  </div>;
}

function signInHref(returnTo: string) {
  return `/api/auth-start?${new URLSearchParams({ returnTo })}`;
}

function WriteButton() {
  const community = useCommunity();
  if (community.isPending || community.isError) return null;
  const profile = community.data?.profile;
  if (!profile && !community.data?.signInAvailable) return null;
  return <MetalButton asChild className="min-h-11 w-auto" innerClassName="px-5">
    {profile ? <Link to="/blog/write"><PenNewSquareIcon className="size-4" aria-hidden />Write a post</Link> : <a href={signInHref("/blog/write")}><GitHubIcon className="size-4" aria-hidden />Sign in to write</a>}
  </MetalButton>;
}

function List() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const topic = blogTopics.find((value) => value === params.get("topic")) ?? "";
  const community = useCommunity();
  const list = useQuery({ queryKey: ["blog", "list", page, topic], queryFn: ({ signal }) => blogApi.list(page, topic, signal), retry: retryApiQuery });
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); setParams(next); };
  return <div className="space-y-6">
    <div className="space-y-3">
      <Heading>Blog</Heading>
      <p className="max-w-md text-balance text-sm leading-relaxed text-t3">Writing from Open Source Circle members. Every post is reviewed before it's published.</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <WriteButton />
        {community.data?.profile && <Link to="/blog/mine" className="forum-action inline-flex items-center">Your posts</Link>}
      </div>
    </div>
    <SharedSelect aria-label="Topic" className="h-11 w-full sm:w-56" value={topic || "all"} onValueChange={(value) => change("topic", value === "all" ? "" : value)} options={[{ value: "all", label: "All topics" }, ...blogTopics.map((value) => ({ value, label: value }))]} />
    {list.isPending ? <ContentSkeleton label="Loading posts…" /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : list.data.items.length ? <>
      <ul aria-label="Blog posts">{list.data.items.map((post) => <BlogCard key={post.slug} post={post} />)}</ul>
      <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={(value) => change("page", String(value))} label="Blog" />
    </> : <EmptyState icon={<NotebookBookmarkIcon className="size-8" />} title={topic ? `No ${topic.toLowerCase()} posts yet` : "No posts yet"} description="Members can write about what they're building and learning. Posts appear here after review.">
      {topic && <TextureButton type="button" variant="secondary" className="min-h-11 w-auto" onClick={() => change("topic", "")}>Show all topics</TextureButton>}
    </EmptyState>}
  </div>;
}

function Post() {
  const { slug = "" } = useParams();
  const post = useQuery({ queryKey: ["blog", "post", slug], queryFn: ({ signal }) => blogApi.read(slug, signal), retry: retryApiQuery });
  useEffect(() => { if (post.data) applyPageMeta(blogSeoDocument(post.data, currentOrigin())); }, [post.data]);
  return <div className="space-y-8">
    <Link to="/blog" className="inline-flex min-h-11 items-center text-sm text-t3 underline underline-offset-4">All posts</Link>
    {post.isPending ? <ContentSkeleton label="Loading the post…" detail /> : post.isError ? (post.error instanceof ApiError && post.error.status === 404
      ? <EmptyState icon={<NotebookBookmarkIcon className="size-8" />} title="This post isn't available" description="It may have been moved or taken down." />
      : <Failure error={post.error} retry={() => void post.refetch()} />)
      : <BlogArticleView post={post.data} />}
  </div>;
}

/** Writing needs GitHub sign-in; the server also checks group membership. */
function Members({ returnTo, children }: { returnTo: string; children: React.ReactNode }) {
  const community = useCommunity();
  if (community.isPending) return <ContentSkeleton label="Checking sign-in…" />;
  if (community.isError) return <Failure error={community.error} retry={() => void community.refetch()} />;
  if (community.data.profile) return <>{children}</>;
  return <div className="max-w-lg space-y-5">
    <Heading>Write for the blog</Heading>
    <p className="text-sm leading-relaxed text-t2">Verified Open Source Circle members can write posts. An admin reviews each one before it's published.</p>
    {community.data.signInAvailable ? <MetalButton asChild className="min-h-11 w-auto" innerClassName="px-5"><a href={signInHref(returnTo)}><GitHubIcon className="size-4" aria-hidden />Sign in with GitHub</a></MetalButton> : <p className="text-sm text-t3">GitHub sign-in is being set up.</p>}
  </div>;
}

function MyPosts() {
  const profile = useCommunity().data!.profile!;
  const mine = useQuery({ queryKey: ["blog", "mine", profile.id], queryFn: ({ signal }) => blogApi.mine(signal), retry: false, gcTime: 0 });
  return <div className="space-y-6">
    <Link to="/blog" className="inline-flex min-h-11 items-center text-sm text-t3 underline underline-offset-4">All posts</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><Heading>Your posts</Heading><WriteButton /></div>
    {mine.isPending ? <ContentSkeleton label="Loading your posts…" /> : mine.isError ? <Failure error={mine.error} retry={() => void mine.refetch()} /> : mine.data.items.length ? <ul aria-label="Your posts" className="divide-y divide-foreground/[0.08]">
      {mine.data.items.map((post) => <MyPost key={post.id} post={post} />)}
    </ul> : <EmptyState icon={<PenNewSquareIcon className="size-8" />} title="You haven't written a post yet" description="Drafts and submissions appear here, with any notes from the reviewer." />}
  </div>;
}

function MyPost({ post }: { post: BlogDraft }) {
  const content = post.revision ?? post.published!;
  const live = !!post.published && !!post.slug;
  const pending = post.review !== "approved" || !!post.revision;
  return <li className="space-y-3 py-6">
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Chip tone={post.review === "changes" || post.review === "rejected" ? "warn" : "muted"}>{blogReviewLabel(post.review, live)}</Chip>}
      {live && !post.hidden && <Chip tone="ok">Live</Chip>}
      {post.hidden && <Chip tone="warn">Hidden by an admin</Chip>}
    </div>
    <h2 className="break-words text-lg font-medium leading-snug [overflow-wrap:anywhere]">{content.title}</h2>
    {post.reviewReason && (post.review === "changes" || post.review === "rejected") && <p className="max-w-prose whitespace-pre-line break-words text-sm text-t2"><span className="font-medium text-foreground">Note from the reviewer: </span>{post.reviewReason}</p>}
    <p className="text-xs text-t3">Updated <BlogDate at={post.updatedAt} /></p>
    <div className="flex flex-wrap items-center gap-2">
      <Link to={`/blog/write/${post.id}`} className="forum-action forum-action-filled">Edit</Link>
      {live && !post.hidden && <Link to={`/blog/${post.slug}`} className="forum-action">View post</Link>}
    </div>
  </li>;
}

function Write() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const profile = useCommunity().data!.profile!;
  const newId = useRef(crypto.randomUUID());
  const id = routeId?.toLowerCase() ?? newId.current;
  const [current, setCurrent] = useState<BlogDraft | null>(null);
  const loaded = current?.id === id ? current : null;
  const existing = useQuery({ queryKey: ["blog", "draft", profile.id, id], queryFn: ({ signal }) => blogApi.draft(id, signal), enabled: !!routeId && !loaded, retry: false, gcTime: 0 });
  const draft = loaded ?? existing.data ?? null;
  const save = useMutation({ mutationFn: ({ action, content }: { action: "save" | "submit"; content: BlogContentInput }) => blogApi.command({ action, requestId: crypto.randomUUID(), id, version: draft?.version ?? 0, content }) });
  async function onSave(action: "save" | "submit", content: BlogContentInput) {
    try {
      const next = await save.mutateAsync({ action, content });
      setCurrent(next);
      void client.invalidateQueries({ queryKey: ["blog"] });
      if (action === "submit") { toast.success("Submitted for review. We'll show the reviewer's decision in Your posts."); navigate("/blog/mine"); }
      else { toast.success("Draft saved."); if (!routeId) navigate(`/blog/write/${id}`, { replace: true }); }
      return true;
    } catch (error) {
      toast.error((error as Error).message, { id: "blog-save" });
      if (error instanceof ApiError && error.code === "blog_conflict") void existing.refetch();
      return false;
    }
  }
  return <div className="space-y-6">
    <Link to="/blog/mine" className="inline-flex min-h-11 items-center text-sm text-t3 underline underline-offset-4">Your posts</Link>
    <Heading>{routeId ? "Edit post" : "Write a post"}</Heading>
    {routeId && !draft ? (existing.isError ? <Failure error={existing.error} retry={() => void existing.refetch()} /> : <ContentSkeleton label="Loading your draft…" detail />)
      : <BlogComposer key={id} initial={draft ?? undefined} busy={save.isPending} onSave={onSave} onLeave={() => navigate("/blog/mine")} />}
  </div>;
}
