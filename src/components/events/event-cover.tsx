import { useState } from "react";
import { ArrowRightUpIcon, MagnifierZoomInIcon, MagnifierZoomOutIcon } from "@solar-icons/react/linear";
import { eventMediaUrl, type EventView } from "@shared/events";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TextureButton } from "@/components/ui/texture-button";
import { cn } from "@/lib/utils";

export function EventCover({ event, admin = false, className }: { event: EventView; admin?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false); const [zoomed, setZoomed] = useState(false);
  if (!event.cover) return null;
  if (failed) return <p role="status" className="text-sm text-t3">The cover image is unavailable.</p>;
  const url = eventMediaUrl(event.slug, event.cover.id, admin);
  return <Dialog onOpenChange={() => setZoomed(false)}>
    <DialogTrigger asChild><button type="button" aria-label={`View full-size cover for ${event.content.title}`} className={cn("mx-auto block max-w-full cursor-zoom-in rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground", className)}><img className="mx-auto h-auto max-h-[70dvh] w-auto max-w-full rounded-2xl object-contain" src={url} alt={event.content.coverAlt} onError={() => setFailed(true)} /></button></DialogTrigger>
    <DialogContent className="w-[calc(100%-1rem)] max-w-[96vw] gap-3 border-0 p-3 pt-14 shadow-none sm:rounded-xl" aria-describedby={undefined}>
      <DialogTitle className="sr-only">Event cover: {event.content.title}</DialogTitle>
      <div className="flex flex-wrap items-center gap-3"><TextureButton type="button" size="sm" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? <MagnifierZoomOutIcon className="size-4 shrink-0" aria-hidden /> : <MagnifierZoomInIcon className="size-4 shrink-0" aria-hidden />}{zoomed ? "Zoom out" : "Zoom in"}</TextureButton><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"><ArrowRightUpIcon className="size-4 shrink-0" aria-hidden />Open original image</a></div>
      <div className="max-h-[calc(100dvh-11rem)] min-w-0 overflow-auto overscroll-contain"><img className={zoomed ? "mx-auto h-auto max-w-none" : "mx-auto h-auto max-h-[calc(100dvh-11rem)] w-auto max-w-full object-contain"} src={url} alt={event.content.coverAlt} /></div>
    </DialogContent>
  </Dialog>;
}
