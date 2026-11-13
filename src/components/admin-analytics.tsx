import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ANALYTICS_PAGES, type AnalyticsDays, type TrafficDay } from "@shared/analytics";
import { Panel, PanelHeader, Chip } from "@/components/panel";
import { SharedSelect } from "@/components/ui/select";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { TextureButton } from "@/components/ui/texture-button";
import { useErrorToast } from "@/hooks/use-error-toast";
import { api, ApiError } from "@/lib/api";
import { formatFull } from "@/lib/format";
import { AdminAnalyticsSkeleton } from "@/components/admin-skeleton";

const dateLabel = (date: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function comparison(current: number, previous: number | null) {
  if (previous === null) return "Building comparison history";
  if (previous === 0) return current > 0 ? `${formatFull(current)} more than previous period` : "No change from previous period";
  if (current === previous) return "No change from previous period";
  const change = Math.round((current - previous) / previous * 100);
  return change === 0 ? `Less than 1% ${current > previous ? "higher" : "lower"} than previous period` : `${change > 0 ? "+" : ""}${formatFull(change)}% vs previous period`;
}

export function AdminAnalytics({ onUnauthorized, onReviewTools }: { onUnauthorized: () => void; onReviewTools: () => void }) {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const query = useQuery({
    queryKey: ["admin", "analytics", days], queryFn: ({ signal }) => api.adminAnalytics(days, signal),
    retry: false, gcTime: 0, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(query.error.code)) onUnauthorized();
  }, [query.error, onUnauthorized]);
  useErrorToast(query.error, "Couldn't load analytics.", { id: "admin-analytics" });
  const data = query.data;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-medium tracking-tight">Overview</h2>
      <SharedSelect aria-label="Analytics period" className="w-40" value={String(days)} onValueChange={(value) => setDays(Number(value) as AnalyticsDays)} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
    </div>
    {query.isPending ? <AdminAnalyticsSkeleton /> : query.isError || !data ? <div className="space-y-3 py-6">
      <p className="text-sm text-t3">Analytics couldn't load. Try again.</p>
      <TextureButton className="w-auto" onClick={() => query.refetch()}>Retry analytics</TextureButton>
    </div> : <>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-6 py-2 sm:grid-cols-4">
        {[
          { label: "Unique visitors", value: data.current.visitors, previous: data.previous?.visitors ?? null },
          { label: "Page views", value: data.current.pageViews, previous: data.previous?.pageViews ?? null },
          { label: "New members", value: data.growth.members, previous: data.growth.previousMembers },
          { label: "Tool submissions", value: data.growth.toolSubmissions, previous: data.growth.previousToolSubmissions },
        ].map((metric) => <div key={metric.label} className="min-w-0">
          <dt className="text-sm text-t3">{metric.label}</dt>
          <dd className="mt-1 break-words text-3xl font-medium tracking-tight tabular sm:text-4xl">{formatFull(metric.value)}</dd>
          <dd className="mt-2 text-xs leading-relaxed text-t3">{comparison(metric.value, metric.previous)}</dd>
        </div>)}
      </dl>
      <Panel header={<PanelHeader title="Traffic" subtitle={`${dateLabel(data.current.daily[0].date)} – ${dateLabel(data.current.daily.at(-1)!.date)} · UTC`} chip={<Chip tone={data.startedAt ? "ok" : "muted"}>{data.startedAt ? "Collecting" : "Waiting for visits"}</Chip>} />}>
        <TrafficChart daily={data.current.daily} />
        <dl className="grid grid-cols-2 gap-4 pb-5">
          <div><dt className="text-xs text-t3">Returning visitors</dt><dd className="mt-1 text-lg tabular">{formatFull(data.current.returningVisitors)} <span className="text-sm text-t3">({data.current.visitors ? Math.round(data.current.returningVisitors / data.current.visitors * 100) : 0}%)</span></dd><dd className="mt-1 text-xs text-t3">Visited on two or more days</dd></div>
          <div><dt className="text-xs text-t3">Views per visitor</dt><dd className="mt-1 text-lg tabular">{data.current.visitors ? (data.current.pageViews / data.current.visitors).toFixed(1) : "—"}</dd><dd className="mt-1 text-xs text-t3">Pages viewed per browser</dd></div>
        </dl>
      </Panel>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <Breakdown title="Popular pages" items={data.current.pages.map((item) => ({ ...item, name: ANALYTICS_PAGES[item.name as keyof typeof ANALYTICS_PAGES] ?? item.name }))} total={data.current.pageViews} />
        <Breakdown title="Referral sources" items={data.current.sources} total={data.current.pageViews} />
      </div>
      {data.growth.pendingTools > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-foreground/[0.045] px-5 py-4">
        <p className="text-sm text-t2">{formatFull(data.growth.pendingTools)} {data.growth.pendingTools === 1 ? "tool needs" : "tools need"} your review</p>
        <TextureButton variant="minimal" size="sm" className="w-auto" onClick={onReviewTools}>Review tools</TextureButton>
      </div>}
      <p className="text-xs leading-relaxed text-t3">Visitors are distinct browsers, not people. Admin pages, known bots and browsers requesting privacy are excluded. {data.startedAt ? `Traffic recorded since ${dateLabel(new Date(data.startedAt).toISOString().slice(0, 10))}.` : "Traffic starts with the first public visit after tracking is enabled."} Growth counts include members and submissions still on the site. Referral counts are page views; Direct includes visits without a referral.</p>
    </>}
  </div>;
}

function TrafficChart({ daily }: { daily: TrafficDay[] }) {
  const [metric, setMetric] = useState("visitors");
  const key = metric === "visitors" ? "visitors" : "pageViews";
  const peak = Math.max(0, ...daily.map((day) => day[key]));
  const max = Math.max(2, Math.ceil(peak / 2) * 2);
  const total = daily.reduce((sum, day) => sum + day[key], 0);
  const middle = Math.floor(daily.length / 2);
  return <div className="py-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="text-xs text-t3">Daily {metric === "visitors" ? "unique visitors" : "page views"}</p>
      <SharedSelect aria-label="Chart metric" className="w-36" value={metric} onValueChange={setMetric} options={[{ value: "visitors", label: "Visitors" }, { value: "pageViews", label: "Page views" }]} />
    </div>
    <div role="img" aria-label={`Daily ${metric === "visitors" ? "unique visitors" : "page views"} from ${daily[0].date} to ${daily.at(-1)!.date}. ${total === 0 ? "No traffic recorded." : `Peak ${formatFull(peak)} in one day. Exact values are in the daily data table.`}`} className="relative h-40">
      <div aria-hidden className="absolute inset-0 flex flex-col justify-between text-xs tabular text-t3">
        {[max, Math.round(max / 2), 0].map((tick, index) => <div key={index} className="flex items-center gap-3"><span className="w-8 shrink-0 text-right">{formatFull(tick)}</span><span className="h-px flex-1 bg-foreground/[0.06]" /></div>)}
      </div>
      <div aria-hidden className="absolute inset-y-1.5 left-11 right-0 flex items-end gap-[2px] sm:gap-1">
        {daily.map((day) => <div key={day.date} title={`${dateLabel(day.date)}: ${formatFull(day[key])}`} className="min-w-0 flex-1 rounded-t-sm bg-foreground/70" style={{ height: `${day[key] / max * 100}%` }} />)}
      </div>
      {total === 0 && <p className="absolute inset-0 flex items-center justify-center bg-card text-sm text-t3">No traffic recorded in this period.</p>}
    </div>
    <div aria-hidden className="ml-11 mt-2 flex justify-between gap-2 text-xs text-t3"><span>{dateLabel(daily[0].date)}</span><span>{dateLabel(daily[middle].date)}</span><span>{dateLabel(daily.at(-1)!.date)}</span></div>
    <details className="mt-4 text-xs text-t3">
      <DisclosureSummary className="w-fit hover:text-foreground">View daily data</DisclosureSummary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left tabular"><caption className="sr-only">Daily traffic in UTC</caption><thead><tr><th scope="col" className="py-2 font-medium">Date</th><th scope="col" className="py-2 text-right font-medium">Visitors</th><th scope="col" className="py-2 text-right font-medium">Page views</th></tr></thead><tbody>{daily.map((day) => <tr key={day.date}><th scope="row" className="py-2 font-normal">{dateLabel(day.date)}</th><td className="text-right">{formatFull(day.visitors)}</td><td className="text-right">{formatFull(day.pageViews)}</td></tr>)}</tbody></table>
      </div>
    </details>
  </div>;
}

function Breakdown({ title, items, total }: { title: string; items: { name: string; views: number }[]; total: number }) {
  return <Panel header={<PanelHeader title={title} />}>
    {items.length === 0 ? <p className="py-8 text-sm text-t3">No visits recorded yet.</p> : <ol className="space-y-4 py-5">
      {items.map((item) => <li key={item.name}>
        <div className="mb-2 flex justify-between gap-3 text-sm"><span className="min-w-0 break-all text-t2">{item.name}</span><span className="shrink-0 tabular text-t3">{formatFull(item.views)} <span className="text-xs">({total ? Math.round(item.views / total * 100) : 0}%)</span></span></div>
        <div aria-hidden className="h-1 rounded-full bg-foreground/[0.06]"><div className="h-full rounded-full bg-foreground/45" style={{ width: `${total ? item.views / total * 100 : 0}%` }} /></div>
      </li>)}
    </ol>}
  </Panel>;
}
