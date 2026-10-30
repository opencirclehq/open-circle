import { AltArrowRightIcon } from "@solar-icons/react/linear";
import type { CoordinationAdminState } from "@shared/coordination";
import { Chip } from "@/components/panel";
import { botPending, type AdminSection } from "@/lib/admin-navigation";

export function AdminQuickActions({ data, tools, unavailable, navigate, retry }: { data?: CoordinationAdminState; tools?: number; unavailable: boolean; navigate: (section: AdminSection) => void; retry: () => void }) {
  const counts = botPending(data);
  const queues = [
    { section: "repositories", label: "Review repositories", count: counts.repositories },
    { section: "projects", label: "Review projects", count: counts.projects },
    { section: "feedback", label: "Confirm feedback", count: counts.feedback },
    { section: "tools", label: "Review tools", count: tools },
    { section: "bot-members", label: "Review break requests", count: counts["bot-members"] },
    { section: "reviews", label: "Review members", count: counts.reviews },
    { section: "deliveries", label: "Resolve deliveries & pins", count: counts.deliveries },
    { section: "joins", label: "Review join requests", count: undefined },
  ] satisfies { section: AdminSection; label: string; count: number | undefined }[];
  return <section aria-labelledby="quick-actions-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="quick-actions-title" className="text-xl font-medium tracking-tight">Quick actions</h2>{data && <Chip tone={data.tracking ? "ok" : "warn"}>{data.tracking ? "Tracking active" : "Tracking paused"}</Chip>}</div>
    {unavailable && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-foreground/[0.045] px-4 py-3 text-sm"><p className="text-t2">WhatsApp queues couldn't be loaded.</p><button type="button" className="min-h-11 rounded-lg px-3 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-foreground/40" onClick={retry}>Retry WhatsApp queues</button></div>}
    <div className="grid gap-x-6 sm:grid-cols-2">{queues.map(({ section, label, count }) => <button key={section} type="button" onClick={() => navigate(section)} className="group flex min-h-14 min-w-0 items-center gap-3 border-b border-foreground/[0.06] py-3 text-left text-sm transition-colors hover:text-foreground focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-foreground/40"><span className="min-w-0 flex-1">{label}</span><span className="shrink-0 text-xs tabular text-t3">{count === undefined ? section === "joins" ? "View requests" : unavailable && section !== "tools" ? "Unavailable" : "Loading…" : count ? `${count} pending` : "Up to date"}</span><AltArrowRightIcon className="size-4 shrink-0 text-t3 group-hover:text-foreground" aria-hidden /></button>)}</div>
    <div className="flex flex-wrap gap-2">{([["group", "Manage group"], ["connection", "Bot connection"], ["settings", "Bot settings"], ["community", "Community moderation"], ["blog", "Blog review"], ["events", "Manage events"]] as const).map(([section, label]) => <button type="button" key={section} className="min-h-11 rounded-xl bg-foreground/[0.045] px-4 text-sm text-t2 transition-colors hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-foreground/40" onClick={() => navigate(section)}>{label}</button>)}</div>
  </section>;
}
