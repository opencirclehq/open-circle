import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SharedSelect } from "@/components/ui/select";
import { ADMIN_GROUPS, ADMIN_SECTIONS, type AdminSection } from "@/lib/admin-navigation";

export function AdminNavigation({ section, navigate, counts }: { section: AdminSection; navigate: (section: string) => void; counts: Partial<Record<AdminSection, number | undefined>> }) {
  const label = (id: AdminSection, title: string) => `${title}${counts[id] ? ` (${counts[id]})` : ""}`;
  return <>
    <div className="space-y-2 lg:hidden"><label htmlFor="admin-section" className="text-sm text-t3">Admin section</label><SharedSelect id="admin-section" aria-label="Admin section" className="min-h-12 w-full" value={section} onValueChange={navigate} options={ADMIN_SECTIONS.map(([id, title]) => ({ value: id, label: label(id, title) }))} /></div>
    <TabsList aria-label="Admin sections" className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-full flex-col items-stretch justify-start gap-5 overflow-y-auto rounded-2xl bg-transparent p-0 pr-2 lg:flex">
      {ADMIN_GROUPS.map((group) => <div key={group.label} role="group" aria-label={group.label} className="space-y-1"><p className="px-3 pb-1 text-xs text-t3">{group.label}</p>{group.sections.map(([id, title]) => <TabsTrigger key={id} value={id} className="min-h-11 w-full justify-start whitespace-normal rounded-xl px-3 text-left focus-visible:ring-2 focus-visible:ring-foreground/40 data-[state=active]:bg-foreground/[0.08]">{label(id, title)}</TabsTrigger>)}</div>)}
    </TabsList>
  </>;
}
