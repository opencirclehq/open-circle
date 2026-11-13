import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ForumAuthor, ForumCommand } from "@shared/forum";
import { FORUM_PAGE_SIZE, forumDestination } from "@shared/forum";
import { AccountCorner } from "@/components/account-corner";
import { Dock } from "@/components/dock";
import { MetalButton } from "@/components/metal-button";
import { ForumEditor } from "@/components/forum/editor";
import { ForumFeed, ForumFilters } from "@/components/forum/feed";
import { ForumThreadView } from "@/components/forum/thread";
import { LegacyHelp } from "@/components/forum/legacy-help";
import { GitHubIcon } from "@/components/brand-icons";
import { CommunitySections } from "@/components/community-sections";
import { ContentSkeleton } from "@/components/site-skeleton";
import { useCommunity } from "@/hooks/use-community";
import { useForumSearch } from "@/hooks/use-forum-search";
import { usePageMeta } from "@/hooks/use-page-meta";
import { forumApi } from "@/lib/forum-api";
import { ApiError } from "@/lib/api";

export function ForumFailure({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="space-y-3 py-6" role="alert"><p className="max-w-lg text-sm text-t2">{error.message}</p>{error instanceof ApiError && error.code === "forum_membership" ? <Link to="/participation#start" className="forum-action inline-flex items-center">Verify membership</Link> : null}{error instanceof ApiError && error.status === 401 ? <a className="forum-action inline-flex items-center" href={`/api/auth-start?${new URLSearchParams({ returnTo: forumDestination(`${window.location.pathname}${window.location.search}`) ?? "/community" })}`}>Sign in again</a> : <button className="forum-action" type="button" onClick={retry}>Try again</button>}</div>;
}
export default function Community() {
  usePageMeta();
  const state = useCommunity();
  const location = useLocation();
  const profile = state.isError ? null : state.data?.profile;
  const client = useQueryClient();
  useEffect(() => () => { void client.cancelQueries({ queryKey: ["forum", profile?.id ?? null] }); client.removeQueries({ queryKey: ["forum", profile?.id ?? null] }); }, [client, profile?.id]);
  return <div className="relative min-h-dvh overflow-x-clip"><div className="app-backdrop" aria-hidden /><AccountCorner />
    <main className="page-container relative min-w-0 space-y-6 pb-36 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-[calc(5rem+env(safe-area-inset-top))]">
      <h1 className="flex min-h-11 items-center pr-28 text-[22px] font-medium tracking-[-0.03em] min-[360px]:text-2xl sm:min-h-0 sm:pr-0">Community</h1>
      {state.isPending ? <ContentSkeleton label="Checking sign-in…" /> : state.isError ? <ForumFailure error={state.error} retry={() => { void state.refetch(); }} /> : !profile ? <div className="max-w-lg space-y-5 py-4"><p className="text-sm leading-relaxed text-t2">Discuss development, ask for help and join community polls. Discussions are for verified Open Source Circle members.</p>{state.data?.signInAvailable ? <MetalButton asChild className="min-h-11 w-auto"><a href={`/api/auth-start?${new URLSearchParams({ returnTo: forumDestination(`${location.pathname}${location.search}`) ?? "/community" })}`}><GitHubIcon className="size-4" />Sign in with GitHub</a></MetalButton> : <p className="text-sm text-t3">GitHub sign-in is being set up.</p>}</div> : <MemberForum key={profile.id} profile={profile} />}
    </main><Dock />
  </div>;
}
function MemberForum({ profile }: { profile: ForumAuthor }) {
  const { id, helpId } = useParams();
  const [params, setParams] = useSearchParams();
  const questions = params.get("tab") === "questions" || !!helpId;
  const submissions = questions && !helpId && params.get("mine") === "1";
  const page = Number(params.get("page") ?? 1);
  const query = useForumSearch(params); query.set("kind", questions ? "question" : "discussion");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const list = useQuery({ queryKey: ["forum", profile.id, "list", query.toString()], queryFn: ({ signal }) => forumApi.list(query, false, signal), enabled: !id && !helpId, retry: false, gcTime: 0 });
  const detail = useQuery({ queryKey: ["forum", profile.id, "detail", id, page], queryFn: ({ signal }) => forumApi.detail(id!, page, false, signal), enabled: !!id, retry: false, gcTime: 0 });
  const active = id ? detail : list;
  const mutation = useMutation({ mutationFn: (command: ForumCommand) => forumApi.command(command, false) });
  async function act(command: ForumCommand) {
    try {
      const result = await mutation.mutateAsync(command);
      if (!alive.current) return false;
      await Promise.all([client.invalidateQueries({ queryKey: ["forum", profile.id] }), client.invalidateQueries({ queryKey: ["board"] })]);
      if (command.action === "create") { setCreating(false); navigate(`/community/${result.id}`); }
      if (command.action === "comment") { const next = new URLSearchParams(params); next.set("page", String(Math.max(1, Math.ceil(result.commentTotal / FORUM_PAGE_SIZE)))); setParams(next); }
      if (command.action === "report") toast.success("Your report is with the admins.");
      if (command.action === "edit") toast.success("Your revision is awaiting approval.");
      return true;
    } catch (error) { if (alive.current) { toast.error((error as Error).message); if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) await client.invalidateQueries({ queryKey: ["forum", profile.id] }); } return false; }
  }
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); setParams(next, { replace: key === "search" }); };
  const view = <div className="space-y-5">
    {!id && !helpId && !active.isError && <>
      {creating && <ForumEditor key={`${profile.id}:${questions}`} kind={questions ? "question" : "discussion"} busy={mutation.isPending} onSave={act} onCancel={() => setCreating(false)} />}
      <ForumFilters params={params} onChange={change} questions={questions} />
    </>}
    {helpId ? null : active.isPending ? <ContentSkeleton label="Loading community…" detail={!!id} /> : active.isError ? <ForumFailure error={active.error} retry={() => { void active.refetch(); }} /> : id && detail.data ? <ForumThreadView key={id} data={detail.data} profile={profile} busy={mutation.isPending} onAction={act} onPage={(p) => change("page", String(p))} /> : list.data ? <>
      {!helpId && <ForumFeed data={list.data} busy={mutation.isPending} onPage={(p) => change("page", String(p))} onLike={(id, liked) => { void act({ action: "like", id, liked, requestId: crypto.randomUUID() }); }} />}
    </> : null}
    {helpId && <LegacyHelp profileId={profile.id} login={profile.login} id={helpId} />}
  </div>;
  return id ? view : <CommunitySections section={submissions ? "submissions" : questions ? "questions" : "discussions"} disabled={mutation.isPending} onChange={() => setCreating(false)} actions={!helpId && !active.isError ? <MetalButton type="button" className="min-h-11 w-auto" disabled={mutation.isPending} aria-expanded={creating} onClick={() => setCreating(!creating)}>{questions ? "Ask a question" : "New discussion"}</MetalButton> : undefined}>{view}</CommunitySections>;
}
