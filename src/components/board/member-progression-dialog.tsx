import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CupStarIcon } from "@solar-icons/react/bold-duotone";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { progressionApi } from "@/lib/progression-api";
import { ProgressionPanel } from "./progression-panel";

/** A small badge that opens a member's achievements, fetched only when opened. */
export function MemberProgressionDialog({ login, nickname }: { login: string; nickname: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["progression", login.toLowerCase()],
    queryFn: ({ signal }) => progressionApi.member(login, signal),
    enabled: open,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${nickname}'s achievements`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-t4 transition-colors hover:bg-foreground/[0.06] hover:text-t2"
      >
        <CupStarIcon size={14} aria-hidden />
      </button>
      <DialogContent className="max-w-lg">
        <DialogTitle>{nickname}</DialogTitle>
        <DialogDescription>Achievements and verified activity for @{login}.</DialogDescription>
        <div className="mt-2">
          {query.isPending ? (
            <p role="status" className="text-sm text-t3">Loading achievements…</p>
          ) : query.isError ? (
            <p className="text-sm text-t3">{query.error instanceof Error ? query.error.message : "Couldn't load achievements."}</p>
          ) : query.data ? (
            <ProgressionPanel progression={query.data} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
