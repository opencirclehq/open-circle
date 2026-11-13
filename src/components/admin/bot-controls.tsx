import { useRef, useState, type ReactNode } from "react";
import type { BotAdminAction } from "@shared/bot-admin";
import { TextureButton } from "@/components/ui/texture-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface BotActions { busy: boolean; needsRefresh?: boolean; run: (input: BotAdminAction) => Promise<boolean> }
const focusRegion = (element: HTMLElement | null) => element?.closest<HTMLElement>("[role='region']") ?? element?.closest<HTMLElement>("[role='tabpanel']") ?? null;
export function BotButton({ children, input, actions, disabled = false }: { children: ReactNode; input: BotAdminAction; actions: BotActions; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  return <TextureButton ref={trigger} type="button" variant="minimal" className="min-h-11 w-auto" disabled={actions.busy || actions.needsRefresh || disabled} onClick={async () => { const target = focusRegion(trigger.current); if (await actions.run(input)) setTimeout(() => { if (!trigger.current?.isConnected && target?.isConnected && document.activeElement === document.body) target.focus({ preventScroll: true }); }, 0); }}>{children}</TextureButton>;
}
export function BotConfirm({ label, title, description, input, actions, reason = false, license = false, disabled = false }: {
  label: string; title: string; description: string; input: (text: string) => BotAdminAction; actions: BotActions; reason?: boolean; license?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const fallback = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={(next) => { if (!actions.busy) setOpen(next); }}>
    <DialogTrigger asChild><TextureButton ref={trigger} type="button" variant="minimal" className="min-h-11 w-auto" disabled={actions.busy || actions.needsRefresh || disabled} onClick={() => { fallback.current = focusRegion(trigger.current); setText(""); setChecked(false); }}>{label}</TextureButton></DialogTrigger>
    <DialogContent className="rounded-[24px] border-0 bg-card shadow-none sm:rounded-[28px]" onCloseAutoFocus={(event) => { if (!trigger.current?.isConnected || trigger.current.disabled) { event.preventDefault(); fallback.current?.focus({ preventScroll: true }); } }}>
      <DialogTitle className="pr-7 font-medium">{title}</DialogTitle><DialogDescription className="whitespace-pre-line break-words text-t2">{description}</DialogDescription>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (actions.busy || actions.needsRefresh || reason && text.trim().length < 10 || license && !checked) return; if (await actions.run(input(text.trim()))) setOpen(false); }}>
        {actions.needsRefresh && <p className="text-sm text-t2" role="status">The result is uncertain. Close this dialog and use Refresh WhatsApp data to review it before another attempt.</p>}
        {reason && <label className="block space-y-2 text-sm"><span>Reason for the member</span><textarea className="field min-h-28 resize-y text-base" required minLength={10} maxLength={300} value={text} onChange={(event) => setText(event.target.value)} disabled={actions.busy} /><span className="block text-xs text-t3">10 to 300 characters</span></label>}
        {license && <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><input className="mt-1 size-4 shrink-0 accent-foreground" type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={actions.busy} required /><span>I reviewed the licence, starter issues and the submitter's permission.</span></label>}
        <div className="flex flex-wrap justify-end gap-2"><TextureButton type="button" variant="secondary" className="min-h-11 w-auto" disabled={actions.busy} onClick={() => setOpen(false)}>Cancel</TextureButton><TextureButton type="submit" className="min-h-11 w-auto" loading={actions.busy} disabled={actions.busy || actions.needsRefresh || reason && text.trim().length < 10 || license && !checked}>{label}</TextureButton></div>
      </form>
    </DialogContent>
  </Dialog>;
}
export function BotLink({ href, children }: { href: string; children?: ReactNode }) {
  let safe = false;
  try { const url = new URL(href); safe = url.protocol === "https:" && !url.username && !url.password; } catch { safe = false; }
  return safe ? <a className="inline-flex min-h-11 items-center break-all text-sm underline decoration-foreground/30 underline-offset-4 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-foreground/40" href={href} target="_blank" rel="noopener noreferrer">{children ?? href}</a> : <span className="break-all text-sm text-t3">{children ?? href}</span>;
}
export function BotItem({ title, detail, children }: { title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return <li className="space-y-3 border-b border-foreground/[0.06] py-5 last:border-0"><div className="min-w-0"><h3 className="break-words text-sm font-medium [overflow-wrap:anywhere]">{title}</h3>{detail && <div className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-t3 [overflow-wrap:anywhere]">{detail}</div>}</div>{children}</li>;
}
