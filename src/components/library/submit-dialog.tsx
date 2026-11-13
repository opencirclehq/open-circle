import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { COMPONENT_CATEGORIES, COMPONENT_LIMITS, parseComponentSubmission, type ComponentSubmissionInput, type ParsedSubmission } from "@shared/components";
import { MetalButton } from "@/components/metal-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMPTY = { name: "", category: "", tags: "", dependencies: "", link: "", source: "", usage: "" };
type Pane = "source" | "usage";

/**
 * Sends a component to the admins' review queue with everything needed to
 * publish it: the code, a usage example and what it depends on. The Markdown
 * is built from these, so there's nothing else to write.
 */
export function SubmitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ids = { name: useId(), category: useId(), tags: useId(), dependencies: useId(), link: useId(), source: useId(), usage: useId() };
  const [form, setForm] = useState(EMPTY);
  const [pane, setPane] = useState<Pane>("source");
  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: event.target.value });
  const send = useMutation({
    mutationFn: api.submitComponent,
    onSuccess: () => {
      toast.success("Sent for review. Thanks for sharing.");
      setForm(EMPTY);
      setPane("source");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (send.isPending) return;
    const parsed = parseComponentSubmission(form);
    if (parsed.ok === false) {
      toast.error(parsed.error);
      const field: keyof ComponentSubmissionInput = parsed.field;
      if (field === "source" || field === "usage") setPane(field);
      window.setTimeout(() => document.getElementById(ids[field])?.focus());
      return;
    }
    send.mutate((parsed as Extract<ParsedSubmission, { ok: true }>).value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A fixed height that never scrolls: the code box takes whatever room is left and scrolls inside itself. */}
      <DialogContent className="flex h-[min(46rem,calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden overflow-y-hidden rounded-[28px] border-0 p-5 shadow-none sm:rounded-[28px] sm:p-6">
        <DialogTitle className="text-base font-medium tracking-tight">Submit a component</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-t3">Paste the code and how to use it. The admins review it before it joins the library.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex min-h-0 flex-1 flex-col gap-2" noValidate>
          <label htmlFor={ids.name} className="sr-only">Component name</label>
          <input id={ids.name} className="field h-11 shrink-0 text-sm" placeholder="Component name" maxLength={COMPONENT_LIMITS.name} value={form.name} onChange={set("name")} />
          {/* One tap per category; the row slides sideways on narrow screens instead of wrapping. */}
          <div role="radiogroup" aria-label="Category" className="-mx-5 flex shrink-0 gap-1.5 overflow-x-auto px-5 py-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6">
            {COMPONENT_CATEGORIES.map((category, index) => {
              const checked = form.category === category;
              return (
                <button key={category} id={index === 0 ? ids.category : undefined} type="button" role="radio" aria-checked={checked} onClick={() => setForm({ ...form, category })}
                  className={cn("h-9 shrink-0 rounded-full px-3.5 text-xs transition-colors", checked ? "bg-foreground text-background" : "bg-foreground/[0.05] text-t2 hover:bg-foreground/[0.09] hover:text-foreground")}>
                  {category}
                </button>
              );
            })}
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <label htmlFor={ids.tags} className="sr-only">Tags</label>
            <input id={ids.tags} className="field h-11 text-sm" placeholder="Tags: footer, glass" value={form.tags} onChange={set("tags")} />
            <label htmlFor={ids.dependencies} className="sr-only">Extra packages</label>
            <input id={ids.dependencies} className="field h-11 text-sm" placeholder="Packages: motion" autoCapitalize="none" spellCheck={false} value={form.dependencies} onChange={set("dependencies")} />
          </div>
          <label htmlFor={ids.link} className="sr-only">Original link</label>
          <input id={ids.link} className="field h-11 shrink-0 text-sm" type="url" inputMode="url" placeholder="Original link, if it's adapted (optional)" maxLength={COMPONENT_LIMITS.link} value={form.link} onChange={set("link")} />

          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2">
            <div role="group" aria-label="Code to paste" className="flex gap-1 self-start rounded-full bg-foreground/[0.05] p-1">
              {(["source", "usage"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={pane === value} onClick={() => setPane(value)}
                  className={cn("relative rounded-full px-3.5 py-1.5 text-xs transition-colors", pane === value ? "text-foreground" : "text-t3 hover:text-foreground")}>
                  {pane === value && <motion.span layoutId="submit-pane-pill" className="absolute inset-0 rounded-full bg-foreground/[0.1]" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
                  <span className="relative">{value === "source" ? "Component code" : "Usage"}</span>
                </button>
              ))}
            </div>
            {pane === "source" ? <>
              <label htmlFor={ids.source} className="sr-only">Component code</label>
              <textarea id={ids.source} className="field h-auto min-h-0 flex-1 resize-none rounded-[20px] py-3 font-mono text-xs leading-relaxed" placeholder={"export function GlassTabs() {\n  return …\n}"} spellCheck={false} autoCapitalize="none" maxLength={COMPONENT_LIMITS.source} value={form.source} onChange={set("source")} />
            </> : <>
              <label htmlFor={ids.usage} className="sr-only">Usage example</label>
              <textarea id={ids.usage} className="field h-auto min-h-0 flex-1 resize-none rounded-[20px] py-3 font-mono text-xs leading-relaxed" placeholder={'import { GlassTabs } from "./glass-tabs";\n\n<GlassTabs items={["One", "Two"]} />'} spellCheck={false} autoCapitalize="none" maxLength={COMPONENT_LIMITS.usage} value={form.usage} onChange={set("usage")} />
            </>}
          </div>
          <MetalButton type="submit" wrapperClassName="mt-1 w-full shrink-0" className="h-11 w-full" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send for review"}</MetalButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
