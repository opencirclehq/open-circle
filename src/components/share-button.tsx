import { useRef, useState } from "react";
import { CheckReadIcon, CopyIcon, ShareIcon } from "@solar-icons/react/linear";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./content-actions.css";

export function ShareButton({ path, title, kind, variant = "plain" }: { path: string; title: string; kind: "discussion" | "question" | "event" | "post"; variant?: "plain" | "filled" | "light" }) {
  const [busy, setBusy] = useState(false);
  const [copiedPath, setCopiedPath] = useState("");
  const [manualLink, setManualLink] = useState("");
  const linkField = useRef<HTMLInputElement>(null);
  const shareTrigger = useRef<HTMLButtonElement>(null);
  const copied = copiedPath === path;
  async function copy(url: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopiedPath(path);
      setManualLink("");
    } catch {
      setManualLink(url);
      linkField.current?.select();
    }
  }
  async function share() {
    setBusy(true);
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share) {
        try { await navigator.share({ title, url }); return; }
        catch (error) { if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return; }
      }
      await copy(url);
    } finally { setBusy(false); }
  }
  const Icon = copied ? CheckReadIcon : ShareIcon;
  return <>
    <button ref={shareTrigger} type="button" className={`content-action${variant === "plain" ? "" : ` content-action-${variant}`}`} aria-label={`${copied ? "Link copied for" : "Share"} ${kind}: ${title}`} disabled={busy} onClick={() => void share()}>
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span aria-live="polite">{copied ? "Copied" : "Share"}</span>
    </button>
    <Dialog open={!!manualLink} onOpenChange={(open) => { if (!open) setManualLink(""); }}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); linkField.current?.focus(); linkField.current?.select(); }} onCloseAutoFocus={(event) => { event.preventDefault(); shareTrigger.current?.focus(); }}>
        <DialogHeader><DialogTitle>Share link</DialogTitle><DialogDescription>Copy this link to share {kind === "event" ? "the event" : `the ${kind}`}.</DialogDescription></DialogHeader>
        <label className="space-y-2"><span className="sr-only">Link to share</span><input ref={linkField} className="field w-full text-sm" value={manualLink} readOnly onFocus={(event) => event.target.select()} /></label>
        {typeof navigator.clipboard?.writeText === "function" && <button className="content-action justify-self-start" type="button" onClick={() => void copy(manualLink)}><CopyIcon className="size-[18px]" aria-hidden />Copy link</button>}
      </DialogContent>
    </Dialog>
  </>;
}
