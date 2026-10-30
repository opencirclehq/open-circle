import { useState, type ReactNode } from "react";
import { Panel, PanelHeader } from "@/components/panel";
import { SharedSelect } from "@/components/ui/select";
import { PaginatedList } from "@/components/pagination";

export function BotQueue<T>({ title, items, searchText, children, empty, busy, filters, initialFilter = "all", matches, toolbar }: {
  title: string; items: readonly T[]; searchText: (item: T) => string; children: (item: T) => ReactNode; empty: string; busy: boolean;
  filters?: { label: string; value: string }[]; initialFilter?: string; matches?: (item: T, filter: string) => boolean; toolbar?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const shown = items.filter((item) => searchText(item).toLowerCase().includes(search.trim().toLowerCase()) && (!matches || matches(item, filter)));
  return <div role="region" aria-label={`${title} queue`} tabIndex={-1} className="rounded-[30px] focus-visible:ring-2 focus-visible:ring-foreground/40"><Panel header={<PanelHeader title={title} subtitle={`${shown.length} ${shown.length === 1 ? "item" : "items"}`} />}>
    {toolbar}
    <div className="flex flex-col gap-3 py-4 sm:flex-row"><input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}`} className="field min-h-11 min-w-0 flex-1 text-base" value={search} onChange={(event) => setSearch(event.target.value)} />{filters && <SharedSelect aria-label={`${title} filter`} className="min-h-11 w-full sm:w-48" value={filter} onValueChange={setFilter} options={filters} />}</div>
    {shown.length ? <PaginatedList items={shown} label={title} resetKey={`${search}:${filter}`} disabled={busy}>{children}</PaginatedList> : <p className="py-8 text-sm text-t3">{items.length && (search || filter !== "all") ? "No items match this filter." : empty}</p>}
  </Panel></div>;
}
