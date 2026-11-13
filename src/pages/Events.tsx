import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDateIcon, VideoFramePlayHorizontalIcon } from "@solar-icons/react/bold-duotone";
import { ArrowRightIcon, ChatRoundDotsIcon } from "@solar-icons/react/linear";
import { CommunitySections } from "@/components/community-sections";
import { Dock } from "@/components/dock";
import { AccountCorner } from "@/components/account-corner";
import { TextureButton } from "@/components/ui/texture-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ApiError } from "@/lib/api";
import { eventsApi } from "@/lib/events-api";
import { eventDate, eventRegistrationOpen, eventStatus, fileSize, type EventView } from "@shared/events";
import { EventCover } from "@/components/events/event-cover";
import { EventDetails } from "@/components/events/event-details";
import { ContentSkeleton } from "@/components/site-skeleton";
import { ShareButton } from "@/components/share-button";
export default function Events() {
  const navigate = useNavigate(); const location = useLocation();
  const { slug } = useParams(); const [params] = useSearchParams(); const admin = params.get("preview") === "1"; const community = useCommunity();
  const identity = community.data?.profile?.id; const [tab, setTab] = useState("upcoming");
  const upcomingTab = useRef<HTMLButtonElement>(null);
  const pastTab = useRef<HTMLButtonElement>(null);
  function browseSchedule(value: string) {
    setTab(value);
    (value === "upcoming" ? upcomingTab : pastTab).current?.focus();
  }
  usePageMeta();
  const query = useQuery<EventView | { events: EventView[]; storageConfigured?: boolean }>({ queryKey: ["events", identity, admin, slug ?? "list"], queryFn: ({ signal }) => slug ? eventsApi.detail(slug, admin, signal) : eventsApi.list(admin, signal), enabled: admin || (!!identity && !community.isError), retry: false, gcTime: 0, staleTime: 0, refetchInterval: 30000 });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const [now, setNow] = useState(Date.now());
  const signedOut = !admin && !identity && !community.isPending;
  const error = query.error ?? community.error;
  const access = error instanceof ApiError && error.status === 403;
  const data = (admin || (!!identity && !community.isError)) ? query.data : undefined;
  useEffect(() => { if (slug && data && !("events" in data) && slug !== data.slug) navigate({ pathname: `/events/${data.slug}`, search: location.search, hash: location.hash }, { replace: true }); }, [slug, data, navigate, location.search, location.hash]);
  return <div className="relative min-h-dvh"><div className="app-backdrop" aria-hidden /><AccountCorner /><main className={`page-container relative z-10 min-w-0 pb-40 ${slug ? "pt-28" : "pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-28"}`}>
    <div className="mx-auto max-w-4xl space-y-6">
      {slug ? <Link className="inline-flex min-h-11 items-center text-sm text-t3 underline underline-offset-4" to="/events">All events</Link> : <h1 className="flex min-h-11 items-center pr-28 text-[22px] font-medium tracking-[-0.03em] min-[360px]:text-2xl sm:min-h-0 sm:pr-0 sm:text-3xl">Community</h1>}
      <CommunitySections section="events">
      {!slug && <h2 className="my-5 text-xl font-medium">Events</h2>}
      {admin && <p role="status" className="text-sm text-warn">Admin preview · {data && "published" in data && data.published ? "Published" : "Draft / unpublished"}</p>}
      {signedOut ? <div className="space-y-4"><p className="text-t3">{slug ? "Sign in with GitHub to register for this event. Your account must be linked to the group." : "Sign in to find community events, recordings and resources."}</p><TextureButton asChild size="lg" innerClassName="!bg-none !bg-foreground !text-background"><a href={`/api/auth-start?returnTo=${encodeURIComponent(slug ? `/events/${slug}` : "/events")}`}>{slug ? "Sign in to register" : "Sign in with GitHub"}</a></TextureButton></div> : error ? <div role="alert" className="space-y-3"><p>{error.message}</p>{access ? <Link className="inline-flex min-h-11 items-center underline" to="/participation">Connect your group account</Link> : <TextureButton onClick={() => { void community.refetch(); void query.refetch(); }}>Try again</TextureButton>}</div> : !data ? <ContentSkeleton label={community.isPending && !admin ? "Checking sign-in…" : "Loading events…"} detail={!!slug} /> : "events" in data ? <>
        <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Event schedule"><TabsTrigger ref={upcomingTab} className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" value="upcoming">Upcoming</TabsTrigger><TabsTrigger ref={pastTab} className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" value="past">Past & recordings</TabsTrigger></TabsList>
        <TabsContent value={tab}><EventList events={data.events} now={now} schedule={tab} admin={admin} onBrowse={browseSchedule} /></TabsContent></Tabs>
      </> : <EventDetails key={`${data.id}:${identity}:${admin}`} event={data} admin={admin} memberId={identity} />}
      </CommunitySections>
    </div></main><Dock /></div>;
}
function EventList({ events, now, schedule, admin, onBrowse }: { events: EventView[]; now: number; schedule: string; admin: boolean; onBrowse: (value: string) => void }) {
  const upcoming = schedule === "upcoming";
  const visible = events.filter(e => upcoming === (!e.content.cancelled && (e.content.endsAt ?? 0) > now)).sort((a,b) => upcoming ? (a.content.startsAt ?? 0)-(b.content.startsAt ?? 0) : (b.content.startsAt ?? 0)-(a.content.startsAt ?? 0));
  if (!visible.length) return (
    <EmptyState
      icon={upcoming ? <CalendarDateIcon className="size-8" /> : <VideoFramePlayHorizontalIcon className="size-8" />}
      title={upcoming ? "No upcoming events" : "No past events yet"}
      description={upcoming ? "New community sessions will appear here when they're scheduled." : "Past sessions, recordings and shared resources will appear here after an event."}
    >
      {events.length ? (
        <TextureButton
          type="button"
          variant="secondary"
          className="min-h-11 w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground/50"
          onClick={() => onBrowse(upcoming ? "past" : "upcoming")}
        >
          {upcoming ? "View past events" : "View upcoming events"}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </TextureButton>
      ) : (
        <TextureButton asChild variant="secondary" className="min-h-11 w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground/50">
          <Link to="/community"><ChatRoundDotsIcon className="size-4" aria-hidden="true" />Explore discussions</Link>
        </TextureButton>
      )}
    </EmptyState>
  );
  return <ul className="divide-y divide-foreground/10">{visible.map(e => <li key={e.id} className="py-6"><div className="flex min-w-0 flex-col items-start gap-5 sm:flex-row">
    <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-4 sm:order-last"><Link to={`/events/${e.slug}`} className="group block w-full space-y-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"><p className="text-xs text-t3">{eventStatus(e,now)}</p><h2 className="break-words text-xl font-medium group-hover:underline">{e.content.title}</h2><p className="text-sm text-t3">{eventDate(e.content.startsAt,e.content.timezone)} · {e.content.timezone}</p><p className="break-words text-sm leading-relaxed text-t2">{e.content.summary}</p><p className="text-sm text-t3">{e.content.host}</p>{e.recording && <p className="text-xs text-t3">Recording · {fileSize(e.recording.size)}</p>}</Link>
    {e.published && <div className="flex max-w-full flex-wrap items-center justify-start gap-2" role="group" aria-label={`Actions for ${e.content.title}`}>{!admin && eventRegistrationOpen(e, now) && <TextureButton asChild size="lg" innerClassName="!bg-none !bg-foreground !text-background"><Link to={`/events/${e.slug}#register`} aria-label={`Register for ${e.content.title}`}>Register</Link></TextureButton>}<ShareButton path={`/events/${e.slug}`} title={e.content.title} kind="event" variant="filled" /></div>}</div>
    {e.cover && <EventCover key={e.cover.id} event={e} admin={admin} className="w-full self-start sm:mx-0 sm:w-56 sm:shrink-0" />}
  </div></li>)}</ul>;
}
