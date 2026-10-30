import { pollApi } from "@/lib/query-policy";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyIcon } from "@solar-icons/react/linear";
import type { LinkChallenge, ParticipationAction, ParticipationState } from "@shared/coordination";
import { parseWhatsappNumber } from "@shared/validation";
import { STAR_HELP_POINTS } from "@shared/star-help";
import { GitHubIcon } from "@/components/brand-icons";
import { CommunityCatchUp, CommunityGuide, CommunityMentoring } from "@/components/community-routine";
import { RepositorySubmissions } from "@/components/repository-submissions";
import { AccountCorner } from "@/components/account-corner";
import { Dock } from "@/components/dock";
import { MetalButton } from "@/components/metal-button";
import { Chip, Panel, PanelHeader } from "@/components/panel";
import { SiteFooter } from "@/components/site-footer";
import { PaginatedList } from "@/components/pagination";
import { ParticipationSkeleton } from "@/components/site-skeleton";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { pageFor } from "@shared/seo";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useErrorToast } from "@/hooks/use-error-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { participationDestination, participationSections, type ParticipationSection } from "@shared/participation-navigation";

type Field = { required?: boolean; name: string; label: string; type?: "text" | "url" | "tel" | "number" | "textarea"; min?: number; max?: number; value?: string; placeholder: string };

/**
 * Compact form. `inline` puts the fields and button on one line from sm up
 * with screen-reader-only labels; otherwise labels sit above each field.
 */
function ParticipationForm({ title, button, fields, busy, submit, reset = true, onEdit, onCancel, inline = false }: { title?: string; button: string; fields: Field[]; busy: boolean; submit: (data: FormData) => Promise<boolean>; reset?: boolean; onEdit?: () => void; onCancel?: () => void; inline?: boolean }) {
  const prefix = useId();
  return <form className={cn("space-y-2.5", inline && "sm:flex sm:items-end sm:gap-2 sm:space-y-0")} onChange={onEdit} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await submit(new FormData(form)) && reset) form.reset();
  }}>
    {title && !inline && <p className="text-sm font-medium text-t2">{title}</p>}
    {fields.map((field) => <label key={field.name} htmlFor={`${prefix}-${field.name}`} className={cn("block", inline ? "min-w-0 sm:flex-1" : "space-y-1.5")}>
      <span className={inline ? "sr-only" : "block text-xs text-t3"}>{field.label}</span>
      {field.type === "textarea"
        ? <textarea id={`${prefix}-${field.name}`} name={field.name} placeholder={field.placeholder} className="field placeholder:text-t3 min-h-24 resize-none rounded-[20px] py-3 text-sm" required={field.required ?? true} minLength={field.min} maxLength={field.max} disabled={busy} />
        : <input id={`${prefix}-${field.name}`} name={field.name} placeholder={field.placeholder} className="field placeholder:text-t3 h-11 text-sm" type={field.type ?? "text"} required={field.required ?? true} min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} minLength={field.type !== "number" ? field.min : undefined} maxLength={field.type !== "number" ? field.max : undefined} defaultValue={field.value} autoComplete={field.type === "tel" ? "tel" : "off"} disabled={busy} />}
    </label>)}
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <MetalButton type="submit" loading={busy} className="min-h-11" innerClassName="px-5">{busy ? "Saving…" : button}</MetalButton>
      {onCancel && <MetalButton type="button" variant="minimal" size="sm" disabled={busy} onClick={onCancel}>Cancel</MetalButton>}
    </div>
  </form>;
}

/** x of y with a thin bar. */
function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return <div className="space-y-2 border-b border-foreground/[0.06] py-4 last:border-0">
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-t3">{label}</span>
      <span className="tabular font-medium text-foreground">{value}<span className="text-t4"> / {total}</span></span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}>
      <div className="h-full rounded-full bg-gradient-to-r from-foreground/60 to-foreground transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  </div>;
}

/** A list row: content left, action right; stacks on phones. */
function Item({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <li className="flex flex-col gap-3 border-b border-foreground/[0.06] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 space-y-1">{children}</div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </li>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-t4">{children}</p>;
}

function FormFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-foreground/[0.06] py-4">{children}</div>;
}

const statusTone = (status: string) => (status === "approved" || status === "open" || status === "confirmed" ? "ok" : status === "pending" ? "warn" : "muted") as "ok" | "warn" | "muted";

function isTemporaryFailure(error: Error | null) {
  return !(error instanceof ApiError) || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export default function Participation() {
  usePageMeta();
  const location = useLocation();
  const navigate = useNavigate();
  const section = participationSections.find((entry) => location.hash === `#${entry.value}`)?.value ?? "overview";
  const requestedSection = useRef<ParticipationSection | null>(null);
  const feedbackFocusRequested = useRef(false);
  const selectSection = (value: ParticipationSection, focusEditor = false) => {
    feedbackFocusRequested.current = focusEditor;
    if (section === value || requestedSection.current === value) return;
    requestedSection.current = value;
    navigate({ pathname: location.pathname, search: location.search, hash: `#${value}` });
  };
  useEffect(() => { requestedSection.current = null; }, [location.key]);
  const page = pageFor("/participation");
  const community = useCommunity();
  const communityUnavailable = community.isError && (!community.data || !isTemporaryFailure(community.error));
  const profile = communityUnavailable ? undefined : community.data?.profile;
  const key = ["participation", profile?.id ?? null];
  const client = useQueryClient();
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => api.participation(signal), enabled: !!profile, refetchInterval: pollApi(15_000), retry: false });
  const [challenge, setChallenge] = useState<LinkChallenge | null>(null);
  const [target, setTarget] = useState<{ kind: "review" | "answer"; id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (error) toast.error(error, { id: "participation" }); }, [error]);
  useEffect(() => { if (notice) toast.success(notice, { id: "participation-notice" }); }, [notice]);
  const owner = useRef(profile?.id);
  owner.current = profile?.id;
  const tabsList = useRef<HTMLDivElement>(null);
  const feedbackForm = useRef<HTMLElement>(null);
  const link = useMutation({ mutationFn: api.linkWhatsapp, onMutate: () => ({ owner: profile?.id }), onSuccess: (result, _input, context) => { if (owner.current === context?.owner) setChallenge(result); } });
  const action = useMutation({ mutationFn: api.participate, onMutate: async () => { await client.cancelQueries({ queryKey: key }); return { owner: profile?.id, key }; }, onSuccess: (result, _input, context) => { if (context && owner.current === context.owner) client.setQueryData<ParticipationState>(context.key, result); }, onSettled: (_result, _error, _input, context) => context && owner.current === context.owner ? client.invalidateQueries({ queryKey: context.key }) : undefined });
  const busy = action.isPending || link.isPending;
  const data = state.data;
  useEffect(() => { setChallenge(null); setTarget(null); setError(null); setNotice(null); if (!profile?.id) client.removeQueries({ queryKey: ["participation"] }); }, [profile?.id, client]);
  useEffect(() => { if (data?.activity.linked) setChallenge(null); }, [data?.activity.linked]);
  useEffect(() => {
    if (!target || section !== "feedback" || !feedbackFocusRequested.current) return;
    feedbackFocusRequested.current = false;
    feedbackForm.current?.querySelector("textarea")?.focus();
  }, [target, section]);
  useEffect(() => {
    if (!profile?.id || !data?.activity.linked || !location.hash) return;
    const destination = location.hash === "#start" ? document.getElementById("start") : tabsList.current;
    destination?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [profile?.id, data?.activity.linked, location.hash]);

  async function submit(input: ParticipationAction) {
    setError(null); setNotice(null);
    try {
      await action.mutateAsync(input);
      if (input.action === "review" || input.action === "answer") { setTarget(null); setNotice("Your contribution is saved and awaits confirmation."); }
      else if (input.action === "project") setNotice("Your project is waiting for admin approval.");
      else if (input.action === "repository") setNotice("Your repo is waiting for admin approval.");
      else if (input.action === "repository-progress") setNotice(input.needsHelp ? "Your repo is looking for contributors again." : "Your repo announcements are paused.");
      else if (input.action === "away") setNotice("Your break request is waiting for admin approval.");
      else if (input.action === "help") setNotice("Your help request is open.");
      else if (input.action === "mentor") setNotice("Your mentor preferences are saved.");
      else if (input.action === "decline-help") setNotice("The help request has been returned to the queue.");
      else setNotice("Saved.");
      return true;
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "Couldn't save that. Try again."); return false; }
  }
  async function linkPhone(form: FormData) {
    setError(null); setNotice(null);
    const phone = parseWhatsappNumber(String(form.get("phone") ?? ""));
    if (!phone.ok) { setError(phone.error); return false; }
    try { await link.mutateAsync(phone.value); return true; }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "Couldn't create your linking code. Try again."); return false; }
  }

  useErrorToast(community.error, "Couldn't check your sign-in. Try again.", { id: "participation-sign-in", retry: () => { void community.refetch(); } });
  useErrorToast(state.error, "Couldn't load participation. Try again.", { id: "participation-load", retry: () => { void state.refetch(); } });
  const mine = (login: string) => !!profile && login.toLowerCase() === profile.login.toLowerCase();

  return <div className="relative min-h-dvh overflow-x-clip">
    <div className="app-backdrop" aria-hidden />
    <div className="relative z-10">
      {/* Signed out, the panel below carries the one sign-in button. */}
      {profile ? <AccountCorner /> : <AccountCorner>{null}</AccountCorner>}

      <main className="page-container min-w-0 space-y-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))] sm:space-y-6 sm:pt-[calc(5rem+env(safe-area-inset-top))]">
        <h1 className="flex min-h-11 items-center pr-28 text-[22px] font-medium tracking-[-0.03em] min-[360px]:text-2xl sm:min-h-0 sm:pr-0">Participation</h1>
        {page && (!profile || !data?.activity.linked) && <p className="max-w-md text-balance text-sm leading-relaxed text-t3">{page.summary}</p>}


        <CommunityGuide key={profile?.id ?? "signed-out"} completed={!!profile && !!data?.activity.linked} />

        {community.isPending ? <ParticipationSkeleton checkingSignIn /> : communityUnavailable ? <div className="flex flex-col items-center gap-3 py-10 text-center">
          <MetalButton variant="minimal" size="sm" wrapperClassName="self-center" className="w-auto" onClick={() => community.refetch()} disabled={community.isFetching}>Try again</MetalButton>
        </div> : !profile ? <Panel header={<PanelHeader title="Sign in" subtitle="Connect your WhatsApp account, give project feedback and see your activity." />}>
          <div className="flex justify-center py-6">
            {community.data?.signInAvailable
              ? <MetalButton asChild className="h-11 w-auto" innerClassName="px-6"><a href={`/api/auth-start?${new URLSearchParams({ returnTo: participationDestination(`/participation${location.hash}`) ?? "/participation" })}`}><GitHubIcon className="size-4" />Sign in with GitHub</a></MetalButton>
              : <p className="text-sm text-t3">GitHub sign-in is being set up.</p>}
          </div>
        </Panel>

        : state.isPending ? <ParticipationSkeleton />

        : state.isError && (!data || !isTemporaryFailure(state.error)) ? <div className="flex flex-col items-center gap-3 py-10 text-center">
          <MetalButton variant="minimal" size="sm" wrapperClassName="self-center" className="w-auto" onClick={() => state.refetch()} disabled={state.isFetching}>Try again</MetalButton>
        </div>

        : data && (!data.activity.linked ? <Panel header={<PanelHeader title="Connect your WhatsApp account" subtitle="Use your number in Open Source Circle with its country code (e.g. +234), then send the code to the bot in a private WhatsApp chat from that account." chip={<Chip tone="muted">Step {challenge ? 2 : 1} of 2</Chip>} />}>
          <div className="py-4">
            <ParticipationForm inline button="Get linking code" fields={[{ name: "phone", label: "Your WhatsApp group number", type: "tel", placeholder: "e.g. +234 803 123 4567" }]} busy={busy} submit={linkPhone} reset={false} onEdit={() => setChallenge(null)} />
          </div>
          {challenge && <div className="space-y-3 border-t border-foreground/[0.06] py-4" role="status">
            <p className="text-sm text-t3">Send this command to the OpenCircle bot in a private WhatsApp chat from that number:</p>
            <div className="flex items-center gap-2 rounded-full bg-foreground/[0.06] py-1.5 pl-4 pr-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-base text-foreground">/link {challenge.code}</code>
              <button type="button" aria-label="Copy command" className="flex size-8 items-center justify-center rounded-full text-t3 hover:text-foreground" onClick={async () => { try { await navigator.clipboard.writeText(`/link ${challenge.code}`); toast.success("Copied."); } catch { toast.error("Couldn't copy."); } }}><CopyIcon size={16} aria-hidden /></button>
            </div>
            {challenge.botChatUrl && <MetalButton asChild className="min-h-11" innerClassName="px-5">
              <a href={challenge.botChatUrl} target="_blank" rel="noopener noreferrer">Open bot chat</a>
            </MetalButton>}
            <p className="text-xs text-t3">{challenge.botChatUrl ? "Open the bot chat and send the prefilled command from the same WhatsApp number. The bot replies there. /link does not work in the group." : "Open the bot's profile in the group and choose Message. It replies after you send the command. /link does not work in the group."}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-t4">Expires in 10 minutes. This page checks automatically.</p>
              <MetalButton variant="minimal" size="sm" className="w-auto" onClick={() => state.refetch()} disabled={state.isFetching}>Check link</MetalButton>
            </div>
          </div>}
        </Panel>

        : <Tabs key={`participation:${profile!.id}`} value={section} onValueChange={(value) => { if (participationSections.some((entry) => entry.value === value)) selectSection(value as ParticipationSection); }}>
          <TabsList ref={tabsList} aria-label="Participation sections" className="mb-6 grid h-auto w-full scroll-mt-24 grid-cols-3 rounded-[24px] sm:inline-flex sm:w-auto sm:rounded-full">
            {participationSections.map((entry) => <TabsTrigger key={entry.value} value={entry.value} className="min-h-11 min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.1]">{entry.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview" forceMount hidden={section !== "overview"}>
            <section id="overview" className="scroll-mt-24 space-y-4 sm:space-y-6">
              <Panel header={<PanelHeader title="Your activity" subtitle={`${data.activity.pendingContributions} contributions await confirmation`} chip={<Chip tone={data.activity.tracking ? "ok" : "warn"}>{data.activity.tracking ? "Tracking" : "Paused"}</Chip>} />}>
                <div className="border-b border-foreground/[0.06] py-4">
                  <p className="mb-3 text-xs text-t3">Repository star support</p>
                  {data.activity.starSupport?.members !== null && data.activity.starSupport?.members !== undefined ? <>
                    <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm min-[480px]:grid-cols-2">
                      {([["Members supported", data.activity.starSupport.members], ["Leaderboard points from stars", data.activity.starSupport.points ?? 0]] as const).map(([name, value]) => <div key={name} className="flex min-w-0 items-baseline justify-between gap-3"><dt className="text-t3">{name}</dt><dd className="shrink-0 tabular-nums text-t1">{value.toLocaleString()}</dd></div>)}
                    </dl>
                    <p className="mt-3 text-xs leading-relaxed text-t3">Starring another member's public, original repository earns {STAR_HELP_POINTS} points, once per member supported. All-time totals from your latest GitHub refresh.</p>
                  </> : <p role="status" className="text-xs leading-relaxed text-t3">Star support is waiting for a complete GitHub refresh of your leaderboard profile.</p>}
                </div>
                {data.activity.engagement?.startedAt !== null && data.activity.engagement?.startedAt !== undefined ? <div className="border-b border-foreground/[0.06] py-4">
                  <p className="mb-3 text-xs text-t3">In the group this week</p>
                  <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm min-[480px]:grid-cols-2">
                    {([["Messages sent", data.activity.engagement.weekly.messages], ["Messages reacted to", data.activity.engagement.weekly.messagesReactedTo], ["Replies sent", data.activity.engagement.weekly.replies], ["Poll votes", data.activity.engagement.weekly.pollVotes]] as const).map(([name, value]) => <div key={name} className="flex min-w-0 items-baseline justify-between gap-3"><dt className="text-t3">{name}</dt><dd className="shrink-0 tabular-nums text-t1">{value.toLocaleString()}</dd></div>)}
                  </dl>
                  <p className="mt-3 text-xs leading-relaxed text-t3">Recorded totals: {data.activity.engagement.total.messages.toLocaleString()} messages, {data.activity.engagement.total.messagesReactedTo.toLocaleString()} messages reacted to, {data.activity.engagement.total.replies.toLocaleString()} replies and {data.activity.engagement.total.pollVotes.toLocaleString()} poll votes. Recording started {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(data.activity.engagement.startedAt)}.</p>
                  <p className="mt-3 text-xs leading-relaxed text-t3">Messages, replies, reactions and poll votes count as group participation. Group reactions do not earn leaderboard points.</p>
                  {data.activity.engagement.enforcement && <p className="mt-3 text-xs leading-relaxed text-t3">{data.activity.engagement.warnings}/3 inactivity warnings this week. A full week without engagement after three delivered warnings leads to automatic removal. Approved breaks and your settling-in period are protected.</p>}
                </div> : <p role="status" className="border-b border-foreground/[0.06] py-4 text-xs leading-relaxed text-t3">Group message and reaction recording has not started. Earlier group activity is unavailable.</p>}
                <Progress label="Confirmed feedback" value={data.activity.contributions} total={data.activity.target} />
                <p className="py-3 text-xs leading-relaxed text-t3">Feedback counts here after the recipient or an admin confirms it. Repository stars and group participation are recorded separately above.</p>
                <Progress label="Members you've given feedback" value={data.activity.reviewPeers} total={data.activity.requiredReviewPeers} />
                {(!data.activity.tracking || data.activity.graceRemainingDays > 0 || data.activity.removalReview) && <div className="space-y-1.5 py-4 text-xs text-t4">
                  {!data.activity.tracking && <p role="status">{data.activity.enabled ? "Tracking is paused while the bot checks group access." : "Coordination is paused. You can still submit feedback."}</p>}
                  {data.activity.graceRemainingDays > 0 && <p>{data.activity.graceRemainingDays} days left in your settling-in period.</p>}
                  {data.activity.removalReview && <p>An admin is reviewing your participation. Pending feedback and approved breaks are checked before any removal.</p>}
                </div>}
              </Panel>

              <Panel header={<PanelHeader title="Need a break?" subtitle="Approved breaks pause tracking." />}>
                <div className="py-4">
                  {data.activity.awayUntil && data.activity.awayUntil > Date.now()
                    ? <p className="text-sm text-t3">Your break is approved until {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(data.activity.awayUntil)}.</p>
                    : data.activity.awayRequestedDays
                      ? <p className="text-sm text-t3">Your {data.activity.awayRequestedDays}-day break awaits admin approval.</p>
                      : <ParticipationForm inline button="Request break" busy={busy} fields={[{ name: "days", label: "Days away, up to 30", type: "number", min: 1, max: 30, value: "7", placeholder: "e.g. 7" }]} submit={(form) => submit({ action: "away", days: Number(form.get("days")) })} />}
                </div>
              </Panel>
            </section>
          </TabsContent>
          <TabsContent value="catch-up" forceMount hidden={section !== "catch-up"}>
            <section id="catch-up" className="scroll-mt-24 space-y-4 sm:space-y-6">
              {data.community ? <CommunityCatchUp data={data.community} /> : <Panel header={<PanelHeader title="Catch up" />}><Empty>No catch-up updates are available yet.</Empty></Panel>}
            </section>
          </TabsContent>
          <TabsContent value="repositories" forceMount hidden={section !== "repositories"} className="space-y-4 sm:space-y-6">
            {data.community ? <RepositorySubmissions repositories={data.community.repositories ?? []} login={profile!.login} busy={busy} submit={submit} contribute={(repo) => { setTarget({ kind: "review", id: repo.id, title: repo.fullName }); selectSection("feedback", true); }} /> : <section id="repositories" className="scroll-mt-24"><Panel header={<PanelHeader title="Open-source repos" />}><Empty>Repo submissions are unavailable right now. Please try again later.</Empty></Panel></section>}
          </TabsContent>
          <TabsContent value="projects" forceMount hidden={section !== "projects"}>
            <section id="projects" className="scroll-mt-24 space-y-4 sm:space-y-6">
              <Panel header={<PanelHeader title="Projects to review" subtitle={`${data.projects.length} in the circle`} />}>
                {data.projects.length ? <PaginatedList items={data.projects} label="Projects to review" resetKey={String(profile?.id)} disabled={busy}>{(project) => <Item key={project.id} action={<>
                  {project.status === "approved" && !mine(project.owner) && <MetalButton variant="secondary" size="sm" className="w-auto" disabled={busy} onClick={() => { setTarget({ kind: "review", id: project.id, title: project.title }); selectSection("feedback", true); }}>Give feedback</MetalButton>}
                  {mine(project.owner) && project.status !== "closed" && <MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "close", id: project.id })}>Close project</MetalButton>}
                </>}>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={project.url} target="_blank" rel="noopener noreferrer" className="break-words font-medium hover:underline hover:underline-offset-4">{project.title}</a>
                    <Chip tone={statusTone(project.status)}>{project.status}</Chip>
                  </div>
                  <p className="text-xs text-t3">@{project.owner} · {project.reviews} confirmed reviews{project.skills?.length ? ` · ${project.skills.join(", ")}` : ""}</p>
                  {project.feedbackWanted && <p className="break-words text-sm text-t3">Feedback wanted: {project.feedbackWanted}</p>}
                  {project.assignedTo.some((login) => mine(login)) && <p className="text-xs text-t2">You're assigned to review this.</p>}
                </Item>}</PaginatedList> : <Empty>No approved projects are waiting for feedback yet.</Empty>}
                <FormFooter>
                  <ParticipationForm button="Submit for review" busy={busy} fields={[{ name: "title", label: "Project name", max: 80, placeholder: "e.g. Developer Portfolio" }, { name: "url", label: "Project link", type: "url", placeholder: "https://github.com/yourname/project" }, { name: "feedbackWanted", label: "What feedback do you need?", min: 10, max: 300, required: false, placeholder: "e.g. Check the mobile layout and keyboard navigation" }, { name: "skills", label: "Skills, separated by commas", max: 240, required: false, placeholder: "react, typescript, design" }]} submit={(form) => submit({ action: "project", title: String(form.get("title")), url: String(form.get("url")), feedbackWanted: String(form.get("feedbackWanted") ?? ""), skills: String(form.get("skills") ?? "").split(",").map((skill) => skill.trim()).filter(Boolean) })} />
                </FormFooter>
              </Panel>
            </section>
          </TabsContent>
          <TabsContent value="help" forceMount hidden={section !== "help"}>
            <section id="help" className="scroll-mt-24 space-y-4 sm:space-y-6">
              <Panel header={<PanelHeader title="Questions" />}>
                <div className="space-y-3 py-4">
                  <p className="text-sm text-t2">Ask questions and find earlier help requests in Community. Existing answer confirmations stay in Feedback.</p>
                  <MetalButton asChild className="min-h-11 w-auto"><Link to="/community?tab=questions">Open questions</Link></MetalButton>
                </div>
              </Panel>
              {data.community && <CommunityMentoring data={data.community} busy={busy} submit={submit} />}
            </section>
          </TabsContent>
          <TabsContent value="feedback" forceMount hidden={section !== "feedback"}>
            <section id="feedback" className="scroll-mt-24 space-y-4 sm:space-y-6">
              {target && <section key={`${target.kind}:${target.id}`} ref={feedbackForm}>
                <Panel header={<PanelHeader title={`Feedback for ${target.title}`} subtitle="Describe your fix, testing, documentation or answer. Include an issue or pull request link if you have one. Useful help earns points after confirmation." />}>
                  <div className="py-4">
                    <ParticipationForm button="Submit feedback" busy={busy} onCancel={() => setTarget(null)} fields={[{ name: "feedback", label: "What you tried and a useful observation or suggestion", type: "textarea", min: 30, max: 1000, placeholder: "I tried the search on mobile. A clear button would help." }]} submit={(form) => submit(target.kind === "review" ? { action: "review", projectId: target.id, text: String(form.get("feedback")) } : { action: "answer", helpId: target.id, text: String(form.get("feedback")) })} />
                  </div>
                </Panel>
              </section>}

              <Panel header={<PanelHeader title="Feedback" subtitle="Given and received." />}>
                {data.contributions.length ? <PaginatedList items={data.contributions} label="Feedback" resetKey={String(profile?.id)} disabled={busy}>{(entry) => <Item key={entry.id} action={entry.status === "pending" && mine(entry.for) ? <>
                  <MetalButton size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: true })}>Confirm useful</MetalButton>
                  <MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: false })}>Needs more detail</MetalButton>
                </> : undefined}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-t4"><span>@{entry.by} → @{entry.for}</span><Chip tone={statusTone(entry.status)}>{entry.status}</Chip></div>
                  <p className="break-words text-sm text-t2">{entry.text}</p>
                </Item>}</PaginatedList> : <Empty>Your submitted and received feedback will appear here.</Empty>}
              </Panel>
            </section>
          </TabsContent>
        </Tabs>)}
      </main>
      <SiteFooter />
      <Dock />
    </div>
  </div>;
}
