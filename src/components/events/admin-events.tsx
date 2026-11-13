import { useEffect, useState } from "react";
import { AddCircleIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightUpIcon, ArrowUpIcon, CalendarDateIcon, CheckCircleIcon, CloseCircleIcon, DisketteIcon, EyeClosedIcon, EyeIcon, GalleryIcon, LinkIcon, PenNewSquareIcon, RefreshIcon, TrashBinMinimalisticIcon, UploadIcon, UsersGroupRoundedIcon, VideocameraRecordIcon } from "@solar-icons/react/linear";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventsApi } from "@/lib/events-api";
import { ApiError } from "@/lib/api";
import { emptyEvent, eventDate, eventLocalTime, eventTimestamp, eventStatus, type EventView, type EventContent } from "@shared/events";
import { TextureButton } from "@/components/ui/texture-button";
import { SharedSelect } from "@/components/ui/select";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { ContentSkeleton } from "@/components/site-skeleton";
import { AssetUpload } from "./asset-upload";
import { EventDetails } from "./event-details";
import { EventAttendees } from "./event-attendees";
import { EventCover } from "./event-cover";
import { useErrorToast } from "@/hooks/use-error-toast";
export default function AdminEvents({ onUnauthorized }: { onUnauthorized: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<EventView | null | undefined>(undefined);
  const query = useQuery({ queryKey: ["admin", "events"], queryFn: ({ signal }) => eventsApi.list(true, signal), retry: false, gcTime: 0 });
  useEffect(() => { if (query.error instanceof ApiError && query.error.status === 401) onUnauthorized(); }, [query.error, onUnauthorized]);
  useErrorToast(query.error, "Couldn't load events.", { id: "admin-events" });
  const saved = (event: EventView) => {
    setSelected(event);
    void queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
    void queryClient.invalidateQueries({ queryKey: ["events"] });
  };
  return <section aria-labelledby="admin-events-title" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="admin-events-title" className="text-xl font-medium tracking-tight">Events</h2>
      {selected === undefined && <TextureButton size="sm" onClick={() => setSelected(null)}><AddCircleIcon className="size-4 shrink-0" aria-hidden />Create event</TextureButton>}
    </div>
    {query.error ? <TextureButton size="sm" onClick={() => query.refetch()}><RefreshIcon className="size-4 shrink-0" aria-hidden />Try again</TextureButton>
      : query.isPending ? <ContentSkeleton label="Loading events…" /> : <>
        {!query.data.storageConfigured && <p role="status" className="text-sm text-warn">Private event storage is not configured. You can save and publish events; file uploads need the separate private R2 setup.</p>}
        {selected !== undefined ? <EventEditor initial={selected} onSaved={saved} onClose={() => setSelected(undefined)} storage={!!query.data.storageConfigured} onUnauthorized={onUnauthorized} />
          : query.data.events.length ? <ul aria-label="Events" className="space-y-4">{query.data.events.map(event => <AdminEventCard key={event.id} event={event} onManage={() => setSelected(event)} />)}</ul>
            : <div className="rounded-2xl bg-foreground/[0.025] px-5 py-10 text-center"><CalendarDateIcon className="mx-auto mb-3 size-7 text-t3" aria-hidden /><p className="text-sm text-t3">No events yet. Create a draft to get started.</p></div>}
      </>}
  </section>;
}

function AdminEventCard({ event, onManage }: { event: EventView; onManage: () => void }) {
  const content = event.content;
  const status = eventStatus(event);
  return <li className="grid min-w-0 grid-cols-1 gap-4 rounded-2xl bg-foreground/[0.025] p-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-5 sm:p-5">
    {event.cover ? <EventCover key={event.cover.id} event={event} admin className="w-full self-start sm:mx-0" />
      : <div className="flex aspect-video items-center justify-center gap-2 rounded-xl bg-foreground/[0.04] text-xs text-t3"><GalleryIcon className="size-5 shrink-0" aria-hidden />No cover image</div>}
    <div className="flex min-w-0 flex-col items-start gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-t3">
        <span className="inline-flex items-center gap-1.5">{event.published ? <CheckCircleIcon className="size-3.5" aria-hidden /> : <PenNewSquareIcon className="size-3.5" aria-hidden />}{event.published ? "Published" : "Draft / unpublished"}</span>
        <span className={content.cancelled ? "text-down" : "text-t3"}>{status}</span>
      </div>
      <div className="min-w-0 space-y-1.5">
        <h3 className="break-words text-lg font-medium leading-snug tracking-tight [overflow-wrap:anywhere]">{content.title || "Untitled event"}</h3>
        {content.summary && <p className="line-clamp-2 break-words text-sm leading-relaxed text-t3">{content.summary}</p>}
      </div>
      <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-xs leading-relaxed text-t3">
        <div className="w-full"><dt className="sr-only">Date and time</dt><dd className="flex items-start gap-2"><CalendarDateIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{content.startsAt === null ? eventDate(null, content.timezone) : <time dateTime={new Date(content.startsAt).toISOString()}>{eventDate(content.startsAt, content.timezone)}</time>} · {content.timezone}</span></dd></div>
        {content.host && <div className="min-w-0"><dt className="sr-only">Host</dt><dd className="flex items-start gap-2"><UsersGroupRoundedIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{content.host}</span></dd></div>}
        {content.platform && <div className="min-w-0"><dt className="sr-only">Platform</dt><dd className="flex items-start gap-2"><VideocameraRecordIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{content.platform}</span></dd></div>}
      </dl>
      {(event.recording || content.resources.length > 0) && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-t3">
        {event.recording && <span className="inline-flex items-center gap-1.5"><VideocameraRecordIcon className="size-3.5" aria-hidden />Recording attached</span>}
        {content.resources.length > 0 && <span className="inline-flex items-center gap-1.5"><LinkIcon className="size-3.5" aria-hidden />{content.resources.length} {content.resources.length === 1 ? "resource" : "resources"}</span>}
      </div>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <TextureButton type="button" size="sm" onClick={onManage}><PenNewSquareIcon className="size-4 shrink-0" aria-hidden />Manage event</TextureButton>
        <TextureButton asChild variant="minimal" size="sm"><Link to={`/events/${event.slug}?preview=1`} target="_blank" rel="noopener noreferrer"><ArrowRightUpIcon className="size-4 shrink-0" aria-hidden />Preview event<span className="sr-only"> (opens in a new tab)</span></Link></TextureButton>
      </div>
    </div>
  </li>;
}

function EventEditor({ initial, onSaved, onClose, storage, onUnauthorized }: { initial: EventView | null; onSaved: (event: EventView) => void; onClose: () => void; storage: boolean; onUnauthorized: () => void }) {
  const [id] = useState(initial?.id ?? crypto.randomUUID()); const [current,setCurrent] = useState(initial); const [content,setContent] = useState<EventContent>(initial?.content ?? emptyEvent()); const [busy,setBusy] = useState(false); const [error,setError] = useState<Error | null>(null); const [notice,setNotice] = useState(""); const [preview,setPreview] = useState(false); const [activeUpload,setActiveUpload] = useState<string | null>(null);
  const [attendees, setAttendees] = useState(false);
  useErrorToast(error, "Could not save the event.", { id: `event-editor:${id}` });
  const dirty = JSON.stringify(content) !== JSON.stringify(current?.content ?? emptyEvent());
  const update = <K extends keyof EventContent>(key: K, value: EventContent[K]) => setContent(c => ({ ...c, [key]: value }));
  const accept = (event: EventView) => { setCurrent(event); setContent(event.content); onSaved(event); };
  async function save(action: string) { setBusy(true); setError(null); setNotice(""); try { const event = await eventsApi.save(id,current?.version ?? 0,content,action); accept(event); setNotice(action === "publish" ? "Event published." : action === "unpublish" ? "Event unpublished." : "Event saved."); } catch(e) { if (e instanceof ApiError && e.status === 401) onUnauthorized(); setError(e instanceof Error ? e : new Error("Could not save the event.")); } finally { setBusy(false); } }
  const field = (key: "title" | "summary" | "description" | "coverAlt" | "host" | "hostUrl" | "platform" | "joinUrl" | "instructions" | "botSessionId", label: string, max: number, multiline = false) => <label className="block min-w-0 space-y-2 text-sm"><span>{label}</span>{multiline ? <textarea className="field h-auto rounded-2xl py-3" rows={key === "description" ? 7 : 3} maxLength={max} value={content[key]} onChange={e => update(key,e.target.value)} /> : <input className="field" maxLength={max} type={key.endsWith("Url") ? "url" : "text"} value={content[key]} onChange={e => update(key,e.target.value)} />}</label>;
  return <div className="space-y-8">
    <TextureButton type="button" variant="minimal" size="sm" disabled={!!activeUpload || busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved event changes?")) onClose(); }}><ArrowLeftIcon className="size-4 shrink-0" aria-hidden />Back to events</TextureButton>
    {current && <details className="group border-b border-foreground/[0.06]" onToggle={e => setAttendees(e.currentTarget.open)}><DisclosureSummary className="py-3 text-sm font-medium"><UsersGroupRoundedIcon className="size-4 shrink-0 text-t3" aria-hidden />View registrations</DisclosureSummary>{attendees && <EventAttendees key={current.id} slug={current.slug} />}</details>}
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save("save"); }}>
      <fieldset disabled={busy || !!activeUpload} className="space-y-5"><legend className="mb-5 text-lg font-medium">{initial ? "Edit event" : "Create event draft"}</legend>
      {field("title","Title",150)}{field("summary","Short summary",400,true)}{field("description","Full description",20000,true)}
      <div className="grid gap-5 sm:grid-cols-2">{field("host","Host or speaker",150)}{field("hostUrl","Host profile link (optional)",2000)}</div>
      <label className="block space-y-2 text-sm"><span>Event timezone</span><SharedSelect aria-label="Event timezone" value={content.timezone} onValueChange={v => update("timezone",v)} options={[...new Set(["Africa/Lagos","UTC",...((Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Europe/London","America/New_York","Asia/Kolkata"]),content.timezone])].map(value => ({ value, label: value }))} /></label>
      <p className="text-xs text-t3">Dates below use the selected event timezone. Changing timezone keeps the saved instant; update the times to reschedule.</p>
      <div className="grid gap-5 sm:grid-cols-2">{(["startsAt","endsAt"] as const).map(key => <label key={key} className="block min-w-0 space-y-2 text-sm"><span>{key === "startsAt" ? "Start date and time" : "End date and time"}</span><input type="datetime-local" className="field min-w-0" value={eventLocalTime(content[key],content.timezone)} onChange={e => { try { update(key,eventTimestamp(e.target.value,content.timezone)); setError(null); } catch(err) { setError(err instanceof Error ? err : new Error("Enter a valid event date and time.")); } }} /></label>)}</div>
      <div className="grid gap-5 sm:grid-cols-2">{field("platform","Meeting platform",100)}{field("joinUrl","HTTPS joining link (optional)",2000)}</div>{field("instructions","Joining instructions (optional)",4000,true)}{field("coverAlt","Cover alternative text",300)}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-foreground" checked={content.cancelled} onChange={e => update("cancelled",e.target.checked)} />Event cancelled</label>
      <details className="group"><DisclosureSummary className="py-3 text-sm"><LinkIcon className="size-4 shrink-0 text-t3" aria-hidden />Link a bot session (optional)</DisclosureSummary>{field("botSessionId","Existing bot session ID",200)}<p className="mt-2 text-xs text-t3">Use the existing bot session ID to show this event's current details in Participation. The bot schedule and WhatsApp messages are unchanged.</p></details>
      </fieldset>
      <div className="flex flex-wrap gap-3"><TextureButton type="submit" disabled={busy || !!activeUpload}><DisketteIcon className="size-4 shrink-0" aria-hidden />{busy ? "Saving…" : current?.published ? "Save changes" : "Save draft"}</TextureButton><TextureButton type="button" disabled={busy || !!activeUpload} onClick={() => void save("publish")}><UploadIcon className="size-4 shrink-0" aria-hidden />{current?.published ? "Update published event" : "Publish event"}</TextureButton>{current?.published && <TextureButton type="button" disabled={busy || !!activeUpload} onClick={() => void save("unpublish")}><EyeClosedIcon className="size-4 shrink-0" aria-hidden />Unpublish event</TextureButton>}</div>
      {notice && <p role="status" className="text-sm text-up">{notice}</p>}
    </form>
    <fieldset disabled={busy || !!activeUpload} className="space-y-4"><legend className="text-lg font-medium">Resources</legend><p className="text-xs text-t3">Save changes after editing titles, descriptions or order.</p><ol className="space-y-5">{content.resources.map((r,i) => <li key={r.id} className="space-y-3 border-b border-foreground/10 pb-5"><label className="block space-y-2 text-sm"><span>Resource title</span><input className="field" maxLength={150} value={r.title} onChange={e => update("resources",content.resources.map(x => x.id === r.id ? { ...x,title: e.target.value } : x))} /></label><label className="block space-y-2 text-sm"><span>Resource description</span><textarea className="field h-auto rounded-2xl py-3" maxLength={500} value={r.description} onChange={e => update("resources",content.resources.map(x => x.id === r.id ? { ...x,description:e.target.value } : x))} /></label>{!r.assetId && <label className="block space-y-2 text-sm"><span>HTTPS resource link</span><input className="field" type="url" maxLength={2000} value={r.url} onChange={e => update("resources",content.resources.map(x => x.id === r.id ? { ...x,url:e.target.value } : x))} /></label>}<div className="flex flex-wrap gap-2"><TextureButton type="button" aria-label={`Move ${r.title || "resource"} up`} disabled={i === 0} onClick={() => { const next = [...content.resources]; [next[i-1],next[i]] = [next[i],next[i-1]]; update("resources",next); }}><ArrowUpIcon className="size-4 shrink-0" aria-hidden />Move up</TextureButton><TextureButton type="button" aria-label={`Move ${r.title || "resource"} down`} disabled={i === content.resources.length-1} onClick={() => { const next = [...content.resources]; [next[i+1],next[i]] = [next[i],next[i+1]]; update("resources",next); }}><ArrowDownIcon className="size-4 shrink-0" aria-hidden />Move down</TextureButton><TextureButton type="button" onClick={() => update("resources",content.resources.filter(x => x.id !== r.id))}><TrashBinMinimalisticIcon className="size-4 shrink-0" aria-hidden />Remove resource</TextureButton></div></li>)}</ol><div className="flex flex-wrap items-center gap-3"><TextureButton type="button" disabled={content.resources.length >= 40} onClick={() => update("resources",[...content.resources,{ id: crypto.randomUUID(),title:"",description:"",url:"",assetId:null }])}><LinkIcon className="size-4 shrink-0" aria-hidden />Add resource link</TextureButton>{dirty && <TextureButton type="button" disabled={busy || !!activeUpload} onClick={() => void save("save")}><DisketteIcon className="size-4 shrink-0" aria-hidden />Save resource changes</TextureButton>}</div></fieldset>
    {current ? <><p className="text-sm text-t3">{dirty ? "Save changes before uploading files or previewing." : "Files attach after storage validation. A failed replacement keeps the current file."}</p>{(["cover","recording","resource"] as const).map(kind => <section key={kind} className="space-y-2 border-t border-foreground/10 pt-5"><h3 className="text-lg font-medium">{kind === "resource" ? "Upload a resource" : kind === "cover" ? "Cover image" : "Recording"}</h3>{kind !== "resource" && current[kind] && <p className="text-sm text-t3">Current: {current[kind]!.title}</p>}{kind === "cover" && current.cover && <EventCover key={current.cover.id} event={current} admin className="w-full max-w-md sm:mx-0" />}<AssetUpload eventId={current.id} kind={kind} disabled={dirty || !storage || busy || (!!activeUpload && activeUpload !== kind)} onActive={active => setActiveUpload(currentKind => active ? kind : currentKind === kind ? null : currentKind)} onSaved={accept} /></section>)}
      <div className="flex flex-wrap gap-3"><TextureButton disabled={dirty} onClick={() => setPreview(!preview)}>{preview ? <CloseCircleIcon className="size-4 shrink-0" aria-hidden /> : <EyeIcon className="size-4 shrink-0" aria-hidden />}{preview ? "Close preview" : "Preview member page"}</TextureButton><TextureButton asChild variant="minimal"><Link to={`/events/${current.slug}?preview=1`} target="_blank" rel="noopener noreferrer"><ArrowRightUpIcon className="size-4 shrink-0" aria-hidden />Open saved preview</Link></TextureButton></div>{preview && !dirty && <div className="border-t border-foreground/10 pt-8"><EventDetails event={current} admin /></div>}
    </> : <p className="text-sm text-t3">Save the draft to upload its cover, recording and files.</p>}
  </div>;
}
