import { lazy, Suspense } from "react";
import { pollApi } from "@/lib/query-policy";
import type * as React from "react";
import { GitHubIcon } from "@/components/brand-icons";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CopyIcon, EyeClosedIcon, EyeIcon, TrashBinMinimalisticIcon } from "@solar-icons/react/bold-duotone";
import { BRAND_NAME } from "@shared/brand";
import { usePageMeta } from "@/hooks/use-page-meta";
import type { AdminAction, AdminConfig, AdminMember, AdminSession, AdminState, Weights } from "@shared/types";
import { MetalButton } from "@/components/metal-button";
import { AccountCorner } from "@/components/account-corner";
import { Dock } from "@/components/dock";
import { LogoutIcon } from "@solar-icons/react/linear";
import { Chip, Panel, PanelHeader, Row } from "@/components/panel";
import { Pagination } from "@/components/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ToolModeration } from "@/components/board/tool-moderation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SharedSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextureButton } from "@/components/ui/texture-button";
import { COMMUNITY_KEY } from "@/hooks/use-community";
import { ApiError, api } from "@/lib/api";
import { formatFull, githubUrl, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useErrorToast } from "@/hooks/use-error-toast";
import { AdminAnalytics } from "@/components/admin-analytics";
import { AdminDashboardSkeleton } from "@/components/admin-skeleton";
import { ContentSkeleton, SettingsSkeleton } from "@/components/site-skeleton";

const AdminEvents = lazy(() => import("@/components/events/admin-events"));
const AdminForum = lazy(() => import("@/components/forum/admin-forum"));
const AdminBlog = lazy(() => import("@/components/blog/admin-blog"));
const AdminBotSettings = lazy(() => import("@/components/admin-bot-settings"));

const SESSION_KEY = ["admin", "session"];
const STATE_KEY = ["admin", "state"];
const TOOLS_KEY = ["admin", "tools"];
const isPrivateQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "admin" && query.queryKey[1] !== "session";

const Admin = () => {
  usePageMeta();
  useEffect(() => {
    try { sessionStorage.removeItem("devechleon:admin"); } catch { return; }
  }, []);
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: ({ signal }) => api.adminSession(signal), retry: false, gcTime: 0, refetchInterval: pollApi(30_000), refetchIntervalInBackground: false });
  const clearPrivate = useCallback(() => {
    void queryClient.cancelQueries({ predicate: isPrivateQuery });
    queryClient.removeQueries({ predicate: isPrivateQuery });
  }, [queryClient]);
  const expire = useCallback(() => {
    clearPrivate();
    queryClient.setQueryData<AdminSession>(SESSION_KEY, { configured: true, profile: null });
  }, [clearPrivate, queryClient]);
  const profile = !session.isError ? session.data?.profile : null;
  useErrorToast(session.error, "Couldn't check admin access.", { id: "admin-session" });
  useEffect(() => {
    if (!profile) clearPrivate();
    return clearPrivate;
  }, [profile, clearPrivate]);
  const signOut = useMutation({
    mutationFn: api.adminSignOut,
    onSuccess: expire,
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="relative min-h-dvh">
      <div className="app-backdrop" aria-hidden />
      <div className="page-container relative z-10 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
        <AccountCorner>
          {profile && <>
            <span className="hidden max-w-36 truncate text-xs text-t3 sm:inline" title={`@${profile.login}`}>@{profile.login}</span>
            <MetalButton variant="icon" size="icon" className="size-9" innerClassName="p-0" aria-label="Sign out" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
              <LogoutIcon className="size-4" aria-hidden />
            </MetalButton>
          </>}
        </AccountCorner>
        <main className="min-w-0 pt-[calc(5rem+env(safe-area-inset-top))]">
          {session.isPending ? <AdminDashboardSkeleton label="Checking admin access…" /> : session.isError ? <div className="space-y-3">
            <TextureButton className="w-auto" onClick={() => session.refetch()}>Try again</TextureButton>
          </div> : profile ? <Dashboard key={profile.id} profile={profile} onUnauthorized={expire} /> : <SignIn configured={session.data.configured} />}
        </main>
      </div>
      <Dock />
    </div>
  );
};

function SignIn({ configured }: { configured: boolean }) {
  const [params] = useSearchParams();
  const error = params.get("signin");
  useEffect(() => {
    if (error) toast.error(error === "admin_forbidden" ? "This GitHub account doesn't have admin access. Try an approved account." : "Sign-in couldn't finish. Please try again.", { id: "admin-signin" });
  }, [error]);
  return <section className="mx-auto flex min-h-[calc(100dvh-12rem)] max-w-md flex-col items-center justify-center gap-5 px-2 text-center" aria-labelledby="admin-title">
    <h1 id="admin-title" className="text-2xl font-medium tracking-tight">Sign in</h1>
    <p className="text-sm leading-relaxed text-t2">{configured ? "Approved GitHub accounts only." : "Admin access hasn't been set up. The site owner needs to enable approved GitHub accounts."}</p>
    {configured && <MetalButton asChild wrapperClassName="self-center" className="h-11 w-auto" innerClassName="px-5"><a href="/api/auth-start?returnTo=%2Fadmin"><GitHubIcon className="size-4" aria-hidden /> Continue with GitHub</a></MetalButton>}
  </section>;
}

function Dashboard({ profile, onUnauthorized }: { profile: NonNullable<AdminSession["profile"]>; onUnauthorized: () => void }) {
  const [section, setSection] = useState("overview");
  const [settingsVisited, setSettingsVisited] = useState(false);
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: STATE_KEY, queryFn: ({ signal }) => api.adminState(signal), retry: false, gcTime: 0, refetchInterval: pollApi(30_000) });
  const tools = useQuery({ queryKey: TOOLS_KEY, queryFn: ({ signal }) => api.adminTools(signal), retry: false, gcTime: 0, refetchInterval: pollApi(30_000) });
  const action = useMutation({
    mutationFn: (a: AdminAction) => api.adminAction(a),
    onSuccess: (next: AdminState) => {
      if (!queryClient.getQueryData<AdminSession>(SESSION_KEY)?.profile) return;
      queryClient.setQueryData(STATE_KEY, next);
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      void queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY });
      toast.success("Saved.");
    },
    onError: (error) => {
      if (error instanceof ApiError && [401, 403, 503].includes(error.status) && ["unauthorized", "admin_disabled", "admin_origin"].includes(error.code)) onUnauthorized();
      toast.error(error.message);
    },
  });
  useEffect(() => {
    for (const error of [state.error, tools.error]) {
      if (error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(error.code)) onUnauthorized();
    }
  }, [state.error, tools.error, onUnauthorized]);
  useErrorToast(state.error, "Couldn't load admin data.", { id: "admin-load" });
  if (state.isPending) return <AdminDashboardSkeleton label="Loading admin data…" />;
  if (state.isError || !state.data) return <div className="space-y-3">
    <TextureButton className="w-auto" onClick={() => state.refetch()}>Try again</TextureButton>
  </div>;
  const pending = tools.data?.filter((tool) => tool.status !== "approved").length;
  const hidden = state.data.members.filter((member) => member.hidden).length;
  return <div className="min-w-0 space-y-6">
    <div className="space-y-2">
      <h1 className="text-2xl font-medium tracking-[-0.03em]">Admin</h1>
      <p className="text-sm text-t3">{formatFull(state.data.members.length - hidden)} visible members · {formatFull(hidden)} hidden{pending !== undefined ? ` · ${formatFull(pending)} tools awaiting review` : ""}</p>
    </div>
    <Tabs value={section} onValueChange={(value) => { if (value === "settings") setSettingsVisited(true); setSection(value); }}>
      <TabsList aria-label="Admin sections" className="mb-6 grid h-auto w-full grid-cols-2 rounded-[24px] sm:inline-flex sm:w-auto sm:rounded-full">
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="overview">Overview</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="members">Members</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="tools">Tools{pending ? ` (${pending})` : ""}</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="events">Events</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="community">Community</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="blog">Blog</TabsTrigger>
        <TabsTrigger className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]" value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><AdminAnalytics onUnauthorized={onUnauthorized} onReviewTools={() => setSection("tools")} /></TabsContent>
      <TabsContent value="members"><FadeIn><Members members={state.data.members} busy={action.isPending} onAction={(a) => action.mutate(a)} /></FadeIn></TabsContent>
      <TabsContent value="events"><Suspense fallback={<ContentSkeleton label="Loading events…" />}><AdminEvents onUnauthorized={onUnauthorized} /></Suspense></TabsContent>
      <TabsContent value="tools"><FadeIn><ToolModeration onUnauthorized={onUnauthorized} /></FadeIn></TabsContent>
      <TabsContent value="community"><Suspense fallback={<ContentSkeleton label="Loading community moderation…" />}><AdminForum profile={profile} onUnauthorized={onUnauthorized} /></Suspense></TabsContent>
      <TabsContent value="blog"><Suspense fallback={<ContentSkeleton label="Loading blog review…" />}><AdminBlog profile={profile} onUnauthorized={onUnauthorized} /></Suspense></TabsContent>
      <TabsContent value="settings" forceMount={settingsVisited || undefined} hidden={section !== "settings"}><FadeIn><div className="space-y-6"><Settings config={state.data.config} saving={action.isPending} onSave={(config) => action.mutate({ action: "config", config })} /><Suspense fallback={<SettingsSkeleton />}><AdminBotSettings onUnauthorized={onUnauthorized} /></Suspense></div></FadeIn></TabsContent>
    </Tabs>
  </div>;
}

/** Tab content eases in on switch. */
function FadeIn({ children }: { children: React.ReactNode }) {
  return <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}>{children}</motion.div>;
}

const WEIGHT_FIELDS: { key: keyof Weights; label: string }[] = [
  { key: "stars", label: "Per star" },
  { key: "followers", label: "Per follower" },
  { key: "repos", label: "Per repo" },
  { key: "reposCap", label: "Repo cap" },
  { key: "activity", label: "Per contribution since joining" },
  { key: "upvotes", label: "Points per repo upvote" },
];

function Settings({ config, saving, onSave }: { config: AdminConfig; saving: boolean; onSave: (c: AdminConfig) => void }) {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const setInvite = (patch: Partial<AdminConfig["invite"]>) => setDraft({ ...draft, invite: { ...draft.invite, ...patch } });

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <Panel
      header={
        <PanelHeader
          title="Settings"
          subtitle="Group invite and GitHub reputation weights (20-point total limit)"
          chip={<Chip tone={config.invite.open ? "ok" : "warn"}>{config.invite.open ? "Invite live" : "Invite paused"}</Chip>}
        />
      }
    >
      <Row label="WhatsApp invite link" htmlFor="invite-url" stack>
        <div className="relative">
          <input
            id="invite-url"
            type="url"
            required
            maxLength={300}
            className="field h-10 pr-11 text-sm"
            value={draft.invite.url}
            onChange={(e) => setInvite({ url: e.target.value })}
          />
          <button
            type="button"
            aria-label="Copy invite link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(draft.invite.url);
                toast.success("Invite link copied.");
              } catch {
                toast.error("Couldn't copy. Select the link and copy it manually.");
              }
            }}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
          >
            <CopyIcon size={16} aria-hidden />
          </button>
        </div>
      </Row>
      <Row label="Invite open" htmlFor="invite-open">
        <Switch id="invite-open" checked={draft.invite.open} onCheckedChange={(open) => setInvite({ open })} />
      </Row>
      <Row label="Message shown when the link is off" htmlFor="invite-note" stack>
        <textarea
          id="invite-note"
          rows={3}
          maxLength={200}
          className="field h-auto resize-none rounded-[20px] py-2.5 text-sm"
          value={draft.invite.note}
          onChange={(e) => setInvite({ note: e.target.value })}
        />
      </Row>
      {WEIGHT_FIELDS.map(({ key, label }) => (
        <Row key={key} label={label} htmlFor={`w-${key}`}>
          <input
            id={`w-${key}`}
            type="number"
            required
            min={0}
            max={10000}
            step="any"
            className="field h-9 w-24 text-right text-sm tabular"
            value={draft.weights[key]}
            onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [key]: Number(e.target.value) } })}
          />
        </Row>
      ))}
      <div className="flex justify-end gap-2 py-4">
        {dirty && (
          <MetalButton wrapperClassName="overflow-clip rounded-full" type="button" variant="minimal" className="h-10 w-auto" innerClassName="px-5" onClick={() => setDraft(config)}>
            Cancel
          </MetalButton>
        )}
        <MetalButton wrapperClassName="overflow-clip rounded-full" className="h-10 w-auto" innerClassName="px-6" loading={saving} disabled={!dirty} type="submit" aria-label="Save settings">
          {saving ? "Saving…" : "Save"}
        </MetalButton>
      </div>
    </Panel>
    </form>
  );
}

function Members({
  members,
  busy,
  onAction,
}: {
  members: AdminMember[];
  busy: boolean;
  onAction: (a: AdminAction) => void;
}) {
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const filtered = members.filter((member) => {
    const match = `${member.nickname} ${member.login} ${member.whatsapp}`.toLowerCase().includes(search.trim().toLowerCase());
    return match && (visibility === "all" || member.hidden === (visibility === "hidden"));
  });
  const pagination = usePagination(filtered, 20, JSON.stringify([search, visibility]));
  const now = Date.now();
  const hidden = members.filter((m) => m.hidden).length;
  return (
    <Panel
      header={
        <PanelHeader
          title="Members"
          subtitle={`${formatFull(members.length)} registered`}
          chip={hidden > 0 ? <Chip tone="warn">{hidden} hidden</Chip> : <Chip tone="ok">All visible</Chip>}
        />
      }
    >
      <div ref={pagination.regionRef} tabIndex={-1} className="flex scroll-mt-6 flex-col gap-3 py-4 sm:flex-row">
        <label className="min-w-0 flex-1"><span className="sr-only">Search members</span><input type="search" className="field" placeholder="Search name, GitHub or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <SharedSelect aria-label="Member visibility" className="sm:w-40" value={visibility} onValueChange={setVisibility} options={[{ value: "all", label: "All members" }, { value: "visible", label: "Visible" }, { value: "hidden", label: "Hidden" }]} />
      </div>
      {filtered.length === 0 ? (
        <p role="status" className="py-8 text-center text-sm text-t3">{members.length ? "No members match these filters." : "No one has registered yet."}</p>
      ) : (
        <ul aria-label="Members">
          {pagination.items.map((m) => (
            <li
              key={m.login}
              className={cn("grid grid-cols-[1.5rem_2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-foreground/[0.06] py-3 last:border-0 sm:flex", m.hidden && "opacity-55")}
            >
              <span className="w-6 shrink-0 font-mono text-xs tabular text-t4">{m.rank || "—"}</span>
              <Avatar className="size-9 shrink-0">
                <AvatarImage src={m.avatarUrl} alt="" />
                <AvatarFallback className="bg-alva-card text-[10px]">{m.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{m.nickname}</span>
                  {m.hidden && <span className="shrink-0 text-[11px] font-normal text-warn">hidden</span>}
                </p>
                <p className="flex flex-wrap gap-x-2 gap-y-1 break-words font-mono text-[11px] text-t4 [overflow-wrap:anywhere]">
                  <a href={githubUrl(m.login)} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:text-t2">
                    @{m.login}
                  </a>
                  <span className="tabular">{m.whatsapp}</span>
                  <span>joined {timeAgo(m.createdAt, now)}</span>
                </p>
              </div>
              <span className="col-span-2 min-w-0 break-words text-sm tabular text-t2 sm:shrink-0 sm:text-right">{formatFull(m.score)}</span>
              <div className="flex shrink-0 justify-end gap-1">
                <TextureButton
                  variant="icon"
                  size="icon"
                  className="size-11"
                  disabled={busy}
                  aria-label={m.hidden ? `Show ${m.nickname}` : `Hide ${m.nickname}`}
                  onClick={() => onAction({ action: m.hidden ? "unhide" : "hide", login: m.login })}
                >
                  {m.hidden ? <EyeIcon size={18} aria-hidden /> : <EyeClosedIcon size={18} aria-hidden />}
                </TextureButton>
                <TextureButton
                  variant="icon"
                  size="icon"
                  className="size-11"
                  disabled={busy}
                  aria-label={`Remove ${m.nickname}`}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.nickname} (@${m.login}) for good? They can register again.`)) {
                      onAction({ action: "remove", login: m.login });
                    }
                  }}
                >
                  <TrashBinMinimalisticIcon size={18} aria-hidden />
                </TextureButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination {...pagination} label="Members" disabled={busy} onPageChange={pagination.changePage} />
    </Panel>
  );
}

export default Admin;
