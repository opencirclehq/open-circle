import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AltArrowDownIcon } from "@solar-icons/react/linear";
import { MetalButton } from "@/components/metal-button";
import { cn } from "@/lib/utils";
import { copyText } from "./code-view";

export interface CopyOption { id: string; label: string; text: () => string; done: string }

/**
 * One metal button for copying: the label copies the current choice (the first
 * option until another is picked), the arrow opens the other choices.
 */
export function CopyMenu({ options }: { options: CopyOption[] }) {
  const [current, setCurrent] = useState(options[0].id);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === current) ?? options[0];

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  const copy = (option: CopyOption) => void copyText(option.text(), option.done);

  return (
    <div ref={root} className="relative">
      <MetalButton asChild className="h-10" innerClassName="gap-0 p-0">
        <div role="group" aria-label="Copy">
          <button type="button" onClick={() => copy(active)} className="flex h-full items-center whitespace-nowrap pl-4 pr-3 text-sm [outline-style:none] focus-visible:underline focus-visible:underline-offset-4">
            {active.label}
          </button>
          <span aria-hidden className="h-4 w-px shrink-0 bg-current opacity-20" />
          <button
            ref={trigger}
            type="button"
            aria-label="More copy options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-full items-center pl-2 pr-3 [outline-style:none] focus-visible:opacity-70"
          >
            <AltArrowDownIcon className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </MetalButton>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            role="menu"
            aria-label="Copy"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-30 mt-2 min-w-44 origin-top-right rounded-2xl bg-[hsl(var(--alva-card))] p-1.5"
          >
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => { setCurrent(option.id); setOpen(false); copy(option); trigger.current?.focus(); }}
                className={cn("flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm [outline-style:none] transition-colors hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.08]", option.id === current ? "text-foreground" : "text-t2")}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
