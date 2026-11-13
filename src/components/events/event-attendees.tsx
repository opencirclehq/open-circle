import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshIcon } from "@solar-icons/react/linear";
import { eventsApi } from "@/lib/events-api";
import { Pagination } from "@/components/pagination";
import { ContentSkeleton } from "@/components/site-skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { useErrorToast } from "@/hooks/use-error-toast";

export function EventAttendees({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["admin", "events", "registrations", slug, page], queryFn: ({ signal }) => eventsApi.registrations(slug, page, signal), retry: false, gcTime: 0 });
  useErrorToast(query.error, "Couldn't load registrations.", { id: `event-registrations:${slug}` });
  return <section aria-label="Event registrations" className="space-y-4">
    <h3 className="text-lg font-medium">Registrations{query.data ? ` (${query.data.total})` : ""}</h3>
    {query.isPending ? <ContentSkeleton label="Loading registrations…" /> : query.isError ? <TextureButton type="button" size="sm" variant="minimal" onClick={() => { void query.refetch(); }}><RefreshIcon className="size-4 shrink-0" aria-hidden />Try again</TextureButton> : query.data.total ? <>
      <ul className="divide-y divide-foreground/10">{query.data.registrations.map(r => <li key={r.id} className="space-y-1 py-3"><p className="break-words font-medium">{r.name}</p><p className="break-words text-sm text-t2">{r.email}</p><p className="text-xs text-t3">@{r.login} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(r.registeredAt)}</p></li>)}</ul>
      <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} label="Registrations" />
    </> : <p className="text-sm text-t3">No registrations yet.</p>}
  </section>;
}
