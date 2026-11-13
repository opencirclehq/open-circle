import { useEffect, useRef, useState } from "react";
import { CloseCircleIcon, RefreshIcon, UploadIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { TextureButton } from "@/components/ui/texture-button";
import { ApiError } from "@/lib/api";
import { eventsApi, fileContentType, uploadPart } from "@/lib/events-api";
import { EVENT_LIMITS, EVENT_PART_BYTES, fileSize, type AssetKind, type EventView } from "@shared/events";
const ACCEPT = { cover: ".png,.jpg,.jpeg,.webp", recording: ".mp4,.webm", resource: ".pdf,.txt,.md,.zip,.pptx" };
export function AssetUpload({ eventId, kind, disabled, onSaved, onActive }: { eventId: string; kind: AssetKind; disabled: boolean; onSaved: (event: EventView) => void; onActive: (active: boolean) => void }) {
  const [file,setFile] = useState<File | null>(null); const [title,setTitle] = useState(""); const [busy,setBusy] = useState(false); const [progress,setProgress] = useState(0); const [error,setError] = useState(""); const [cancelling,setCancelling] = useState(false); const [preview,setPreview] = useState(""); const [duration,setDuration] = useState<number | null>(null);
  const session = useRef<{ id: string; part: number } | null>(null); const controller = useRef<AbortController | null>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!file || kind !== "cover") { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file,kind]);
  useEffect(() => {
    setDuration(null); if (!file || kind !== "recording") return;
    const url = URL.createObjectURL(file); const media = document.createElement("video"); media.preload = "metadata";
    media.onloadedmetadata = () => { if (Number.isFinite(media.duration)) setDuration(media.duration); }; media.src = url;
    return () => { media.onloadedmetadata = null; media.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file,kind]);
  async function start() {
    if (!file || !title.trim()) return; setBusy(true); setError(""); const abort = new AbortController(); controller.current = abort;
    const upload = session.current ?? { id: crypto.randomUUID(), part: 1 };
    try {
      if (file.size > EVENT_LIMITS[kind]) throw new Error(`Choose a file smaller than ${fileSize(EVENT_LIMITS[kind])}.`);
      session.current = upload; onActive(true);
      const result = await eventsApi.upload<{ id: string; state: string }>({ action: "initiate", eventId, uploadId: upload.id, kind, filename: file.name, contentType: fileContentType(file,kind), size: file.size, title, duration }, abort.signal);
      if (result.state !== "complete") {
        const parts = Math.ceil(file.size / EVENT_PART_BYTES);
        for (; upload.part <= parts; upload.part++) {
          abort.signal.throwIfAborted();
          const { url } = await eventsApi.upload<{ url: string }>({ action: "part", eventId, id: upload.id, part: upload.part }, abort.signal);
          const offset = (upload.part - 1) * EVENT_PART_BYTES;
          await uploadPart(url, file.slice(offset, Math.min(offset + EVENT_PART_BYTES,file.size)), bytes => { if (mounted.current) setProgress(Math.min(99, Math.round((offset+bytes)/file.size*100))); }, abort.signal);
        }
      }
      const saved = await eventsApi.upload<EventView>({ action: "complete", eventId, id: upload.id }, abort.signal);
      if (mounted.current) { onSaved(saved); setProgress(100); setFile(null); setTitle(""); session.current = null; onActive(false); }
    } catch (e) { if (mounted.current && !abort.signal.aborted) { const message = e instanceof Error ? e.message : "Upload failed. Retry to continue."; setError(message); toast.error(message, { id: `event-upload:${eventId}:${kind}` }); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function cancel() {
    controller.current?.abort(); setCancelling(true); setError("");
    try { if (session.current) await eventsApi.upload({ action: "abort", eventId, id: session.current.id }); session.current = null; setFile(null); setTitle(""); setProgress(0); onActive(false); }
    catch (e) { if (e instanceof ApiError && e.status === 404) { session.current = null; setFile(null); setTitle(""); setProgress(0); onActive(false); } else { const message = `Cancellation could not be confirmed. ${e instanceof Error ? e.message : "Try again."}`; setError(message); toast.error(message, { id: `event-upload:${eventId}:${kind}` }); } }
    finally { setCancelling(false); }
  }
  return <div className="space-y-3 py-3">
    <p className="text-sm text-t3">{kind === "cover" ? "PNG, JPEG or WebP · 3 MB" : kind === "recording" ? "MP4 (H.264/AAC) or WebM (VP8/VP9/Opus) · up to 5 GB. Export for web playback; add a transcript in Resources when available." : "PDF, TXT, Markdown, ZIP or PowerPoint (.pptx) · up to 50 MB"}</p>
    <label className="block space-y-2 text-sm"><span>Choose {kind === "resource" ? "resource file" : kind}</span><input className="block w-full min-w-0 text-sm file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-3" type="file" accept={ACCEPT[kind]} disabled={disabled || busy || !!session.current || cancelling} onChange={e => { setFile(e.target.files?.[0] ?? null); setProgress(0); setError(""); setTitle((e.target.files?.[0]?.name ?? "").slice(0,150)); }} /></label>
    {preview && <img className="h-auto w-full max-w-sm rounded-xl object-contain" src={preview} alt="Selected cover preview" />}
    {file && <><label className="block space-y-2 text-sm"><span>Upload title</span><input className="field" value={title} maxLength={150} disabled={busy || !!session.current} onChange={e => setTitle(e.target.value)} /></label><div className="flex flex-wrap gap-2"><TextureButton type="button" disabled={disabled || busy || cancelling || !title.trim()} onClick={() => void start()}>{error ? <RefreshIcon className="size-4 shrink-0" aria-hidden /> : <UploadIcon className="size-4 shrink-0" aria-hidden />}{error ? "Retry upload" : busy ? "Uploading…" : "Upload file"}</TextureButton><TextureButton type="button" disabled={cancelling} onClick={() => void cancel()}><CloseCircleIcon className="size-4 shrink-0" aria-hidden />{cancelling ? "Cancelling…" : "Cancel upload"}</TextureButton></div></>}
    {(busy || progress > 0) && <div role="status" aria-live="polite"><progress className="h-2 w-full accent-foreground" value={progress} max={100} aria-label={`${kind} upload progress`} /><p className="text-xs text-t3">{progress === 100 ? "Upload verified and attached." : progress >= 99 ? "Verifying upload…" : `Uploading ${progress}%`}</p></div>}
  </div>;
}
