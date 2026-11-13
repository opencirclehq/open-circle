import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CheckIcon, CloseCircleIcon, CodeSquareIcon, DocumentTextIcon, LinkIcon, RestartIcon, TrashBinMinimalisticIcon } from "@solar-icons/react/linear";
import { submissionMarkdown, type ComponentSubmission, type ComponentSubmissionStatus } from "@shared/components";
import { CodeView, copyText } from "@/components/library/code-view";
import { AdminToolsSkeleton } from "@/components/admin-skeleton";
import { MetalButton } from "@/components/metal-button";
import { Pagination } from "@/components/pagination";
import { Chip, Panel } from "@/components/panel";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useErrorToast } from "@/hooks/use-error-toast";
import { usePagination } from "@/hooks/use-pagination";
import { ApiError, api } from "@/lib/api";
import { formatFull, timeAgo } from "@/lib/format";
import { pollApi } from "@/lib/query-policy";

export const COMPONENTS_KEY = ["admin", "components"];

const STATUS: Record<ComponentSubmissionStatus, { label: string; tone: "ok" | "warn" | "muted" }> = {
  pending: { label: "Pending review", tone: "warn" },
  accepted: { label: "Accepted", tone: "ok" },
  declined: { label: "Declined", tone: "muted" },
};
const DONE: Record<ComponentSubmissionStatus, string> = { pending: "Moved back to review.", accepted: "Accepted.", declined: "Declined." };

const shortLink = (link: string) => { try { const url = new URL(link); return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`; } catch { return link; } };

/** Admins review components members sent from the library page. */
export function ComponentReview({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const submissions = useQuery({ queryKey: COMPONENTS_KEY, queryFn: ({ signal }) => api.adminComponents(signal), retry: false, gcTime: 0, refetchInterval: pollApi(30_000) });
  const action = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: ComponentSubmissionStatus | "delete" }) => {
      if (next === "delete") await api.removeComponent(id);
      else await api.reviewComponent(id, next);
    },
    onSuccess: async (_, { next }) => {
      toast.success(next === "delete" ? "Submission deleted." : DONE[next]);
      await queryClient.invalidateQueries({ queryKey: COMPONENTS_KEY });
    },
  });
  useEffect(() => {
    for (const error of [submissions.error, action.error]) {
      if (error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(error.code)) onUnauthorized?.();
    }
  }, [submissions.error, action.error, onUnauthorized]);
  useErrorToast(submissions.isError || null, "Couldn't load component submissions.", { id: "components-review-load", retry: () => submissions.refetch() });
  useErrorToast(action.error, "That didn't work. Try again.");

  const all = submissions.data ?? [];
  const count = (value: ComponentSubmissionStatus) => all.filter((item) => item.status === value).length;
  const query = search.trim().toLowerCase();
  const shown = all.filter((item) => (status === "all" || item.status === status) && `${item.name} ${item.category} ${item.tags.join(" ")} ${item.link} ${item.submitter?.login ?? ""}`.toLowerCase().includes(query));
  const [open, setOpen] = useState<string | null>(null);
  const pagination = usePagination(shown, 20, JSON.stringify([status, search]));
  const now = Date.now();

  return (
    <section ref={pagination.regionRef} tabIndex={-1} className="scroll-mt-6" aria-labelledby="review-components-title">
      <Panel
        header={
          <div className="min-w-0">
            <h2 id="review-components-title" className="text-lg font-medium tracking-tight sm:text-xl">Components</h2>
            <p className="mt-0.5 text-sm text-t3">
              {submissions.data ? `${formatFull(count("pending"))} pending · ${formatFull(count("accepted"))} accepted · ${formatFull(count("declined"))} declined` : "Library submissions"}
            </p>
          </div>
        }
      >
        <div className="flex flex-col gap-3 py-4 sm:flex-row">
          <input type="search" aria-label="Search submissions" placeholder="Search submissions" className="field min-w-0 flex-1 text-base" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SharedSelect aria-label="Submission status" className="w-full text-sm sm:w-48" value={status} onValueChange={setStatus}
            options={[{ value: "pending", label: "Pending review" }, { value: "accepted", label: "Accepted" }, { value: "declined", label: "Declined" }, { value: "all", label: "All submissions" }]} />
        </div>
        {submissions.isPending ? <AdminToolsSkeleton /> : submissions.isError ? (
          <div className="flex justify-center py-8">
            <TextureButton size="sm" variant="minimal" className="w-auto" onClick={() => submissions.refetch()}>Try again</TextureButton>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-t3">{all.length ? (status === "pending" && !query ? "Nothing waiting. All caught up." : "No submissions match this filter.") : "No submissions yet. They arrive from the Submit button on the components page."}</p>
        ) : (
          <ul key={`${status}:${pagination.page}`} aria-label="Component submissions">
            <AnimatePresence initial={false}>
              {pagination.items.map((item) => (
                <motion.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ layout: { type: "spring", stiffness: 340, damping: 34 }, duration: 0.2 }}
                  className="overflow-hidden border-b border-foreground/[0.06] py-4 last:border-0"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Submission item={item} now={now} />
                    <Actions item={item} busy={action.isPending} codeOpen={open === item.id} toggleCode={() => setOpen(open === item.id ? null : item.id)} act={(next) => action.mutate({ id: item.id, next })} />
                  </div>
                  {open === item.id && (
                    <div className="mt-4 space-y-3">
                      <CodeView code={item.source} label={`${item.slug}.tsx`} maxHeight="24rem" />
                      {item.usage && <CodeView code={item.usage} label="Usage" maxHeight="12rem" />}
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {!submissions.isPending && <Pagination {...pagination} label="Component submissions" disabled={action.isPending} onPageChange={pagination.changePage} />}
      </Panel>
    </section>
  );
}

function Submission({ item, now }: { item: ComponentSubmission; now: number }) {
  const login = item.submitter?.login;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{item.name}</span>
        <Chip tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Chip>
      </div>
      <p className="text-xs text-t2">
        {item.category}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""} · {item.dependencies.length ? `needs ${item.dependencies.join(", ")}` : "no extra packages"} · {item.source.split("\n").length} lines{item.usage ? "" : " · no usage example"}
      </p>
      {item.link && (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-t2 hover:text-foreground hover:underline hover:underline-offset-4">
          <LinkIcon className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{shortLink(item.link)}</span>
        </a>
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-t3">
        {login ? (
          <a href={`https://github.com/${login}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Avatar className="size-4"><AvatarImage src={item.submitter!.avatarUrl} alt="" /><AvatarFallback className="text-[8px]">{login[0]}</AvatarFallback></Avatar>@{login}
          </a>
        ) : <span>Not signed in</span>}
        <span aria-hidden>·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>{timeAgo(item.createdAt, now)}</time>
        {item.reviewer && <><span aria-hidden>·</span><span>{STATUS[item.status].label.toLowerCase()} by @{item.reviewer}</span></>}
      </p>
    </div>
  );
}

function Actions({ item, busy, codeOpen, toggleCode, act }: { item: ComponentSubmission; busy: boolean; codeOpen: boolean; toggleCode: () => void; act: (next: ComponentSubmissionStatus | "delete") => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pl-4">
      <TextureButton variant="minimal" className="h-10 w-auto" innerClassName="px-4" aria-expanded={codeOpen} aria-label={`${codeOpen ? "Hide" : "View"} code for ${item.name}`} onClick={toggleCode}>
        <CodeSquareIcon aria-hidden className="size-4" /> {codeOpen ? "Hide code" : "View code"}
      </TextureButton>
      <TextureButton variant="minimal" className="size-10" innerClassName="p-0" aria-label={`Copy ${item.name} as Markdown`} title="Copy as Markdown" onClick={() => void copyText(submissionMarkdown(item), "Markdown copied.")}>
        <DocumentTextIcon aria-hidden className="size-4" />
      </TextureButton>
      {item.status === "pending" && <>
        <MetalButton wrapperClassName="overflow-clip rounded-full" className="h-10 w-auto" innerClassName="px-4" disabled={busy} aria-label={`Accept ${item.name}`} onClick={() => act("accepted")}>
          <CheckIcon aria-hidden className="size-4" /> Accept
        </MetalButton>
        <TextureButton variant="minimal" className="h-10 w-auto" innerClassName="px-4" disabled={busy} aria-label={`Decline ${item.name}`} onClick={() => act("declined")}>
          <CloseCircleIcon aria-hidden className="size-4" /> Decline
        </TextureButton>
      </>}
      {item.status !== "pending" && (
        <TextureButton variant="minimal" className="h-10 w-auto" innerClassName="px-4" disabled={busy} aria-label={`Move ${item.name} back to review`} onClick={() => act("pending")}>
          <RestartIcon aria-hidden className="size-4" /> Reopen
        </TextureButton>
      )}
      <TextureButton variant="minimal" className="size-10" innerClassName="p-0" disabled={busy} aria-label={`Delete ${item.name}`} title="Delete" onClick={() => {
        if (window.confirm(`Delete ${item.name}? A component with this name can then be sent again.`)) act("delete");
      }}>
        <TrashBinMinimalisticIcon aria-hidden className="size-4" />
      </TextureButton>
    </div>
  );
}
