import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BOT_OPTION_FIELDS, MESSAGE_TEMPLATES, messageTemplateError, type BotOptions, type BotSettingsInput, type BotSettingsState } from "@shared/bot-settings";
import type { CommunitySettings, CoordinationPolicy } from "@shared/coordination";
import type { AdminSession } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { pollApi } from "@/lib/query-policy";
import { Chip, Panel, PanelHeader, Row } from "@/components/panel";
import { MetalButton } from "@/components/metal-button";
import { SharedSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SettingsSkeleton } from "@/components/site-skeleton";
import { AdminBotMessages } from "@/components/admin-bot-messages";
import { useBotAdmin } from "@/hooks/use-bot-admin";
import { TextureButton } from "@/components/ui/texture-button";

const KEY = ["admin", "bot-settings"];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ label, value: String(value) }));
const configuration = ({ version, policy, community, options, messages }: BotSettingsState | BotSettingsInput): BotSettingsInput => ({ version, policy, community, options, messages });
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sections = [["welcome", "Welcome"], ["schedule", "Schedule"], ["automation", "Group posts"], ["notifications", "Private replies"], ["participation", "Participation"], ["moderation", "Moderation"], ["messages", "Messages"]];

export default function AdminBotSettings({ onUnauthorized }: { onUnauthorized: () => void }) {
  const client = useQueryClient();
  const groups = useBotAdmin("groups", onUnauthorized, false);
  const query = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.botSettings(signal), retry: false, gcTime: 0, refetchInterval: pollApi(60_000), refetchIntervalInBackground: false });
  const [saved, setSaved] = useState<BotSettingsInput | null>(null);
  const [draft, setDraft] = useState<BotSettingsInput | null>(null);
  const dirty = draft !== null && !same(draft, saved);
  useEffect(() => { if (query.data && !dirty && !same(configuration(query.data), saved)) { const next = structuredClone(configuration(query.data)); setSaved(next); setDraft(structuredClone(next)); } }, [query.data, dirty, saved]);
  useEffect(() => { if (query.error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(query.error.code)) onUnauthorized(); }, [query.error, onUnauthorized]);
  const save = useMutation({
    mutationFn: api.saveBotSettings,
    onSuccess: (next) => {
      if (!client.getQueryData<AdminSession>(["admin", "session"])?.profile) return;
      const value = configuration(next); setSaved(structuredClone(value)); setDraft(structuredClone(value)); client.setQueryData(KEY, next); toast.success("Bot settings saved.");
    },
    onError: (error) => { if (error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(error.code)) onUnauthorized(); if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: KEY }); },
  });
  if (!draft || !query.data) return <Panel header={<PanelHeader title="Bot settings" />}>
    {query.isPending ? <SettingsSkeleton /> : <div className="space-y-4 py-5"><p className="max-w-prose text-sm text-t2" role="alert">{query.error?.message ?? "Bot settings could not be loaded."}</p><MetalButton type="button" variant="minimal" className="h-10 w-auto" innerClassName="px-4" onClick={() => query.refetch()}>Retry bot settings</MetalButton></div>}
  </Panel>;
  const state = query.data;
  const patchPolicy = (patch: Partial<CoordinationPolicy>) => setDraft({ ...draft, policy: { ...draft.policy, ...patch } });
  const patchCommunity = (patch: Partial<CommunitySettings>) => setDraft({ ...draft, community: { ...draft.community, ...patch } });
  const patchOption = (key: keyof BotOptions, value: boolean | number) => setDraft({ ...draft, options: { ...draft.options, [key]: value } });
  const invalidMessage = (Object.keys(MESSAGE_TEMPLATES) as (keyof typeof MESSAGE_TEMPLATES)[]).map((key) => messageTemplateError(key, draft.messages[key])).find(Boolean);
  const newer = state.version !== draft.version;
  const busy = save.isPending;
  const optionRows = (section: string) => (Object.entries(BOT_OPTION_FIELDS) as [keyof BotOptions, typeof BOT_OPTION_FIELDS[keyof BotOptions]][]).filter(([key, field]) => field.section === section && Object.prototype.hasOwnProperty.call(draft.options, key)).map(([key, field]) => <Control key={key} id={`bot-${key}`} label={field.label} help={field.description}>
    {typeof field.value === "boolean" ? <Switch id={`bot-${key}`} checked={draft.options[key] as boolean} disabled={busy} onCheckedChange={(value) => patchOption(key, value)} /> : key.endsWith("Day") || key.startsWith("spotlightDay") ? <SharedSelect id={`bot-${key}`} value={String(draft.options[key])} disabled={busy} onValueChange={(value) => patchOption(key, Number(value))} options={days} /> : key.endsWith("Slot") ? <SharedSelect id={`bot-${key}`} value={String(draft.options[key])} disabled={busy} onValueChange={(value) => patchOption(key, Number(value))} options={draft.policy.welcomeTimes.map((time, index) => ({ value: String(index), label: `Batch ${index + 1} · ${time}` }))} /> : <input id={`bot-${key}`} type="number" required min={field.min} max={field.max} step={1} className="field h-11 text-sm tabular" value={draft.options[key] as number} disabled={busy} onChange={(event) => patchOption(key, Number(event.target.value))} />}
  </Control>);
  const communityToggle = (key: keyof CommunitySettings, label: string, help: string) => <Control id={`bot-community-${key}`} label={label} help={help}><Switch id={`bot-community-${key}`} checked={!!draft.community[key]} disabled={busy} onCheckedChange={(value) => patchCommunity({ [key]: value })} /></Control>;
  return <form onSubmit={(event) => { event.preventDefault(); if (!busy && dirty && !invalidMessage && !newer) save.mutate(draft); }}>
    <Panel header={<PanelHeader title="Bot settings" subtitle="Welcome messages, schedules, participation and moderation" chip={<Chip tone={state.status.connected ? "ok" : "warn"}>{state.status.connected ? "Bot connected" : "Bot disconnected"}</Chip>} />}>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-foreground/[0.06] py-4 text-xs text-t3" aria-label="Bot status">
        <span>{state.status.botAdmin ? "Group admin access confirmed" : "Group admin access unavailable"}</span><span>{state.status.groupOpen === null ? "Group access not checked" : state.status.groupOpen ? "Discussion open" : "Admins only"}</span><span>{state.status.pendingWelcomes} queued welcomes</span><span>{state.status.uncertainDeliveries} deliveries need review</span><span>{state.status.lastCheckAt ? `Last checked ${new Date(state.status.lastCheckAt).toLocaleTimeString("en", { timeZone: state.policy.timezone, hour: "2-digit", minute: "2-digit" })} (${state.policy.timezone})` : "Waiting for the first group check"}</span>
        <a className="text-t2 underline decoration-foreground/30 underline-offset-4 hover:text-foreground" href={state.status.consoleUrl} target="_blank" rel="noreferrer">Open bot console</a>
      </div>
      {state.status.lastDeliveryError && <p className="py-3 text-sm text-[hsl(var(--warn))]" role="status">{state.status.lastDeliveryError}</p>}
      <Control id="bot-enabled" label="Coordination active" help="Pause scheduled content and participation observation. Account linking and member-initiated commands remain available."><Switch id="bot-enabled" checked={draft.policy.enabled} disabled={busy} onCheckedChange={(enabled) => patchPolicy({ enabled })} /></Control>
      {newer && <div className="space-y-3 py-4" role="status"><p className="text-sm text-t2">Another admin saved newer settings. Your draft is preserved. Reload before making another save.</p><MetalButton type="button" variant="minimal" className="h-10 w-auto" innerClassName="px-4" onClick={() => { if (!dirty || window.confirm("Discard your unsaved bot changes and load the latest settings?")) { const next = configuration(state); setSaved(structuredClone(next)); setDraft(structuredClone(next)); save.reset(); } }}>Load latest bot settings</MetalButton></div>}
      <Tabs defaultValue="welcome" className="pt-4">
        <TabsList aria-label="Bot settings sections" className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl sm:grid-cols-4 lg:grid-cols-7">{sections.map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-11 min-w-0 rounded-xl px-3 focus-visible:ring-2 focus-visible:ring-foreground/40">{label}</TabsTrigger>)}</TabsList>
        <TabsContent value="welcome">{optionRows("welcome")}<p className="py-4 text-sm leading-relaxed text-t3">Edit the greeting, introduction, signup steps and rules pointer under Messages → Welcome. Newcomer mentions only appear when tagging is on. The initial group roster is never automatically welcomed.</p></TabsContent>
        <TabsContent value="schedule">
          <Control id="bot-timezone" label="Time zone" help="Use an IANA time zone. All batch, quiet-hour and weekly session times follow it."><input id="bot-timezone" className="field h-11 text-sm" required maxLength={80} placeholder="Africa/Lagos" value={draft.policy.timezone} disabled={busy} onChange={(event) => patchPolicy({ timezone: event.target.value })} /></Control>
          {draft.policy.welcomeTimes.map((time, index) => <Control key={index} id={`bot-time-${index}`} label={`Batch ${index + 1}`} help="Keep the three batches at least two hours apart and outside quiet hours."><input id={`bot-time-${index}`} type="time" required className="field h-11 text-sm" value={time} disabled={busy} onChange={(event) => patchPolicy({ welcomeTimes: draft.policy.welcomeTimes.map((value, position) => position === index ? event.target.value : value) })} /></Control>)}
          {(["quietStart", "quietEnd"] as const).map((key) => <Control key={key} id={`bot-${key}`} label={key === "quietStart" ? "Quiet hours start" : "Quiet hours end"} help={key === "quietStart" ? "Scheduled group content and automatic private digests stop during quiet hours." : "Scheduled content can resume after this time."}><input id={`bot-${key}`} type="time" required className="field h-11 text-sm" disabled={busy} value={`${String(draft.policy[key]).padStart(2, "0")}:${String(draft.policy[`${key}Minute`] ?? 0).padStart(2, "0")}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); patchPolicy({ [key]: hour, [`${key}Minute`]: minute }); }} /></Control>)}
          {communityToggle("groupSchedule", "Automatically open and close discussion", "Close the group during quiet hours and reopen it afterward. Keep this off if you want to control opening manually.")}
          {optionRows("schedule")}
        </TabsContent>
        <TabsContent value="automation">
          {optionRows("automation")}
          {communityToggle("summariesEnabled", "Daily catch-up", "Combine published decisions, new projects, unanswered questions and confirmed contributions. Ordinary chat messages are not collected.")}
          {communityToggle("repositoriesEnabled", "Repository announcements", "Announce approved repositories and one follow-up when they still need help.")}
          {communityToggle("pinRepositories", "Pin repository announcements", "Pin confirmed announcements for seven days. Requires bot admin access; uncertain pin outcomes need review.")}
          {communityToggle("weeklyBoardEnabled", "Weekly developer board snapshot", "Use verified public totals. Delayed helper totals are left out.")}
          <Control id="bot-summaryTime" label="Catch-up batch" help="All catch-up and repository content shares one of the three existing daily batches."><SharedSelect id="bot-summaryTime" value={draft.community.summaryTime} disabled={busy} onValueChange={(summaryTime) => patchCommunity({ summaryTime })} options={draft.policy.welcomeTimes.map((value) => ({ value, label: value }))} /></Control>
          <Control id="bot-announcementsJid" label="Announcements group" help="Use Open Source Circle or another group where the bot has admin access."><div className="space-y-2"><SharedSelect id="bot-announcementsJid" className="min-h-11 w-full" value={draft.community.announcementsJid || "current"} disabled={busy} onValueChange={(value) => patchCommunity({ announcementsJid: value === "current" ? "" : value })} options={[{ value: "current", label: "Open Source Circle" }, ...(groups.data ?? []).map((group) => ({ value: group.jid, label: group.name })), ...(draft.community.announcementsJid && !groups.data?.some((group) => group.jid === draft.community.announcementsJid) ? [{ value: draft.community.announcementsJid, label: "Saved announcements group" }] : [])]} /><TextureButton type="button" variant="minimal" className="min-h-11 w-auto" disabled={busy || groups.isFetching} onClick={() => groups.refetch()}>{groups.isFetching ? "Loading groups…" : "Load available groups"}</TextureButton></div></Control>
          {communityToggle("mentorMatching", "Volunteer mentor matching", "Match open questions to opted-in mentors, within each volunteer's own weekly limit.")}
          <NumericControl id="bot-mentorWaitHours" label="Mentor wait in hours" help="Wait this long after an unanswered question before looking for a volunteer." value={draft.community.mentorWaitHours} min={1} max={168} disabled={busy} onChange={(mentorWaitHours) => patchCommunity({ mentorWaitHours })} />
          {communityToggle("sessionsEnabled", "Weekly help and demo sessions", "Publish the upcoming sessions. When automatic group hours are on, sessions must fit inside open hours.")}
          {(["help", "demo"] as const).map((kind) => <div key={kind}><Control id={`bot-${kind}Day`} label={`${kind === "help" ? "Help" : "Demo"} session day`}><SharedSelect id={`bot-${kind}Day`} value={String(draft.community[`${kind}Day`])} disabled={busy} options={days} onValueChange={(value) => patchCommunity({ [`${kind}Day`]: Number(value) })} /></Control><Control id={`bot-${kind}Time`} label={`${kind === "help" ? "Help" : "Demo"} session time`}><input id={`bot-${kind}Time`} type="time" required className="field h-11 text-sm" disabled={busy} value={draft.community[`${kind}Time`]} onChange={(event) => patchCommunity({ [`${kind}Time`]: event.target.value })} /></Control></div>)}
          <NumericControl id="bot-sessionMinutes" label="Session duration in minutes" value={draft.community.sessionMinutes} min={15} max={180} disabled={busy} onChange={(sessionMinutes) => patchCommunity({ sessionMinutes })} />
        </TabsContent>
        <TabsContent value="notifications">{optionRows("notifications")}<p className="py-4 text-sm leading-relaxed text-t3">Only a member-initiated private chat can link an account. The bot never replies to /link in the group. Turning private command replies off also pauses account linking.</p></TabsContent>
        <TabsContent value="participation">
          {([["graceDays", "New member grace in observed days", 14, 60], ["target", "Confirmed contributions per period", 1, 20], ["reviewPeers", "Different review recipients required", 1, 20], ["periodDays", "Participation period in observed days", 28, 90], ["reminderDays", "Reminder after observed inactive days", 14, 106], ["warningDays", "Final warning after observed inactive days", 21, 113], ["removalDays", "Removal review after observed inactive days", 28, 120]] as const).map(([key, label, min, max]) => <NumericControl key={key} id={`bot-policy-${key}`} label={label} value={draft.policy[key]} min={min} max={max} disabled={busy} onChange={(value) => patchPolicy({ [key]: value })} />)}
          <p className="py-4 text-sm leading-relaxed text-t3">Changing participation thresholds starts a fresh observation period. Existing history stays saved. Offline time and approved breaks do not count. Keep at least seven observed days between reminders, warnings and removal review.</p>
        </TabsContent>
        <TabsContent value="moderation">{optionRows("moderation")}<div className="space-y-3 py-5 text-sm leading-relaxed text-t3"><p>Flagged members always need an admin review. Group admins are protected from removal.</p><p>There are no automatic removals. Pending feedback, requested or approved breaks, stale tracking and the observation period block inactivity removal. A delivered final warning and at least seven observed days are required.</p><p>Unconfirmed messages, group changes and pins are never silently retried. Review those outcomes in the bot console.</p></div></TabsContent>
        <TabsContent value="messages"><AdminBotMessages messages={draft.messages} disabled={busy} onChange={(key, value) => setDraft({ ...draft, messages: { ...draft.messages, [key]: value } })} /></TabsContent>
      </Tabs>
      {invalidMessage && <p className="py-3 text-sm text-[hsl(var(--down))]" role="status">{invalidMessage}</p>}
      {save.error && <p className="py-3 text-sm text-[hsl(var(--down))]" role="alert">{save.error.message} Your changes are still here.</p>}
      {query.isError && <p className="py-3 text-sm text-t2" role="status">The latest bot check failed. Your draft is preserved.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.06] py-4"><span className="text-xs text-t3" aria-live="polite">{dirty ? "Unsaved bot changes" : `Saved · version ${draft.version}`}</span><div className="flex max-w-full flex-wrap items-center gap-2">{dirty && <MetalButton type="button" variant="minimal" wrapperClassName="overflow-clip rounded-full" className="h-10 w-auto" innerClassName="px-5" disabled={busy} onClick={() => { setDraft(structuredClone(saved)); save.reset(); }}>Cancel bot changes</MetalButton>}<MetalButton type="submit" wrapperClassName="overflow-clip rounded-full" className="h-10 w-auto" innerClassName="px-5" loading={busy} disabled={!dirty || !!invalidMessage || newer} aria-label="Save bot settings">{busy ? "Saving…" : "Save bot settings"}</MetalButton></div></div>
    </Panel>
  </form>;
}

function Control({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return <Row label={label} htmlFor={id} stack><div className="flex min-w-0 flex-col items-start gap-2">{children}{help && <p className="max-w-prose text-xs leading-relaxed text-t3">{help}</p>}</div></Row>;
}

function NumericControl({ id, label, help, value, min, max, disabled, onChange }: { id: string; label: string; help?: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  return <Control id={id} label={label} help={help}><input id={id} type="number" required min={min} max={max} step={1} className="field h-11 text-sm tabular" disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))} /></Control>;
}
