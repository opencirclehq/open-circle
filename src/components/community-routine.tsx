import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventsApi } from "@/lib/events-api";
import { useCommunity } from "@/hooks/use-community";
import { eventDate, eventStatus } from "@shared/events";
import { sessionEvent } from "@shared/event-sessions";
import type { MemberCommunityState, ParticipationAction } from "@shared/coordination";
import { PaginatedList } from "@/components/pagination";
import { MetalButton } from "@/components/metal-button";
import { Panel, PanelHeader } from "@/components/panel";
import { DisclosureSummary } from "@/components/ui/disclosure";

export function CommunityGuide({ completed = false }: { completed?: boolean }) {
  const instructions = <>
    <ol className="list-decimal space-y-3 py-4 pl-5 text-sm leading-relaxed text-t2">
      <li><a href="/" className="underline underline-offset-4">Join the developer board</a> using Rank me and your WhatsApp group number.</li>
      <li>Sign in below and connect that WhatsApp account through a private message to the bot.</li>
      <li>Try a member’s project and offer useful feedback, or ask a clear question. Read the catch-up archive for decisions and resources.</li>
    </ol>
    <p className="pb-4 text-xs text-t3">Read the group description for the rules. You can ask the bot for /start, /catchup or /sessions in a private chat.</p>
  </>;
  return <section id="start" className="scroll-mt-24">
    {completed ? <details className="group border-b border-foreground/[0.06]">
      <DisclosureSummary className="py-3 text-sm font-medium">Instructions</DisclosureSummary>
      {instructions}
    </details> : <Panel header={<PanelHeader title="Start here" />}>{instructions}</Panel>}
  </section>;
}

export function CommunityCatchUp({ data }: { data: MemberCommunityState }) {
  const account = useCommunity();
  const events = useQuery({ queryKey: ["events",account.data?.profile?.id,false,"list"], queryFn: ({ signal }) => eventsApi.list(false,signal), enabled: !!account.data?.profile, retry: false, gcTime: 0, refetchInterval: 30000 });
  const date = new Intl.DateTimeFormat("en", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });
  return <Panel header={<PanelHeader title="Catch up" />}>
    {data.groupSchedule && <p className="py-3 text-sm text-t3">Group quiet hours: {String(data.quietStart).padStart(2, "0")}:{String(data.quietStartMinute ?? 0).padStart(2, "0")} to {String(data.quietEnd).padStart(2, "0")}:{String(data.quietEndMinute ?? 0).padStart(2, "0")} ({data.timezone}). You can use this page at any time.</p>}
    {data.sessions.length > 0 && <div className="border-b border-foreground/[0.06] py-4">
      <h2 className="mb-3 text-sm font-medium">Upcoming sessions</h2>
      <PaginatedList items={data.sessions} label="Upcoming sessions" pageSize={5} className="space-y-3">{(session) => { const managed = sessionEvent(session,events.isError ? [] : events.data?.events ?? []); return <li key={session.id} className="text-sm">{managed ? <><Link to={`/events/${managed.slug}`} className="inline-flex min-h-11 items-center underline">{managed.content.title}</Link><p className="text-xs text-t3">{eventStatus(managed)} · {eventDate(managed.content.startsAt,managed.content.timezone)} ({managed.content.timezone})</p></> : <><p>{session.title}</p><p className="text-xs text-t3"><time dateTime={new Date(session.startsAt).toISOString()}>{date.format(session.startsAt)}</time> ({data.timezone}) · {Math.round((session.endsAt - session.startsAt) / 60_000)} minutes · Bot schedule</p></>}</li>; }}</PaginatedList>
    </div>}
    <Link to="/events" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Events, recordings and resources</Link>
    {data.updates.length ? <PaginatedList items={data.updates} label="Catch-up updates" pageSize={5} ordered className="divide-y divide-foreground/[0.06]">{(update) => <li key={update.id} className="space-y-2 py-4">
      <h2 className="break-words text-sm font-medium">{update.title}</h2>
      <time className="block text-xs text-t3" dateTime={new Date(update.createdAt).toISOString()}>{date.format(update.createdAt)}</time>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-t2">{update.text}</p>
    </li>}</PaginatedList> : <p className="py-5 text-sm text-t3">No catch-up updates have been published yet.</p>}
  </Panel>;
}

export function CommunityMentoring({ data, busy, submit }: { data: MemberCommunityState; busy: boolean; submit: (input: ParticipationAction) => Promise<boolean> }) {
  return <Panel header={<PanelHeader title="Volunteer to help" subtitle="Choose your skills and a weekly limit. You can pause or decline requests." />}>
    <form key={JSON.stringify(data.mentor)} className="space-y-4 py-4" onSubmit={async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      await submit({ action: "mentor", available: values.get("available") === "on", skills: String(values.get("skills") ?? "").split(",").map((skill) => skill.trim()).filter(Boolean), weeklyLimit: Number(values.get("weeklyLimit")) });
    }}>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="available" defaultChecked={data.mentor.available} disabled={busy} className="size-4 accent-foreground" />Available for help requests</label>
      <label className="block space-y-1.5 text-sm"><span>Your mentoring skills, separated by commas</span><input className="field placeholder:text-t3 h-11 text-sm" name="skills" defaultValue={data.mentor.skills.join(", ")} maxLength={240} placeholder="react, typescript, design" disabled={busy} /><span className="block text-xs text-t3">Up to eight skills. Add the same skill names to questions you want help with.</span></label>
      <label className="block space-y-1.5 text-sm"><span>Maximum requests per week</span><input className="field placeholder:text-t3 h-11 text-sm" name="weeklyLimit" type="number" min={1} max={5} required defaultValue={data.mentor.weeklyLimit} placeholder="e.g. 2" disabled={busy} /></label>
      <MetalButton type="submit" loading={busy} className="min-h-11" innerClassName="px-5">Save mentor preferences</MetalButton>
    </form>
  </Panel>;
}
