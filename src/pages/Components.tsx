import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Widget4Icon } from "@solar-icons/react/bold-duotone";
import { AddIcon, AltArrowLeftIcon, AltArrowRightIcon, CloseCircleIcon, FullScreenIcon, MagnifierIcon, MoonIcon, RestartIcon, Sun2Icon } from "@solar-icons/react/linear";
import { AccountCorner } from "@/components/account-corner";
import { Dock } from "@/components/dock";
import { CodeView } from "@/components/library/code-view";
import { CopyMenu } from "@/components/library/copy-menu";
import { ScaledPreview } from "@/components/library/scaled-preview";
import { SubmitDialog } from "@/components/library/submit-dialog";
import { MetalButton } from "@/components/metal-button";
import { SiteFooter } from "@/components/site-footer";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageMeta } from "@/hooks/use-page-meta";
import { findItem, itemMarkdown, LIBRARY, searchLibrary, type CanvasTheme, type LibraryItem } from "@/library/registry";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
/** Columns each tile spans: 6 on wide screens, 2 on tablets, stacked on phones. Heights follow each component's own shape. */
const SPAN: Record<LibraryItem["card"]["span"], string> = {
  6: "sm:col-span-2 lg:col-span-6",
  4: "sm:col-span-2 lg:col-span-4",
  2: "lg:col-span-2",
};
const canvasBackground = (canvas: CanvasTheme) => ({
  backgroundImage: `radial-gradient(${canvas === "dark" ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.08)"} 1px, transparent 1px)`,
  backgroundSize: "18px 18px",
});

export default function Components() {
  usePageMeta();
  const { slug } = useParams();
  const [params] = useSearchParams();
  // The share-image capture opens /components/<slug>?og=1 and photographs just the component.
  if (slug && params.has("og")) return <OgFrame slug={slug} />;
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />
      <AccountCorner />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl px-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-28">
        {slug ? <Detail slug={slug} /> : <Library />}
      </main>
      <SiteFooter />
      <Dock />
    </div>
  );
}

/* ---------- Library grid ---------- */

function Library() {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const results = useMemo(() => searchLibrary(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="flex min-h-11 items-center pr-28 text-[22px] font-medium tracking-[-0.03em] min-[360px]:text-2xl sm:min-h-0 sm:pr-0 sm:text-3xl">Components</h1>
        <p className="max-w-md text-balance text-sm leading-relaxed text-t3">Copy-paste React components from the circle. Preview them, test them, take the code.</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <MagnifierIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-t3" aria-hidden />
          <input type="search" aria-label="Search components" placeholder="Search components" value={query} onChange={(event) => setQuery(event.target.value)} className="field h-11 pl-11 text-base sm:text-[15px]" />
        </div>
        <MetalButton type="button" className="h-11 w-auto" innerClassName="gap-1.5 px-3.5 sm:px-5" aria-label="Submit a component" onClick={() => setSubmitting(true)}>
          <AddIcon className="size-4" aria-hidden /><span className="hidden sm:inline">Submit</span>
        </MetalButton>
      </div>

      {results.length === 0 ? (
        <EmptyState icon={<Widget4Icon className="size-8" />} title="No components match" description={`Nothing for "${query.trim()}" yet. Know a good one? Submit it.`}>
          <MetalButton type="button" className="h-11 w-auto" innerClassName="px-5" onClick={() => setSubmitting(true)}>Submit a component</MetalButton>
        </EmptyState>
      ) : (
        <ul aria-label="Components" className="grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <AnimatePresence initial={false}>
            {results.map((item) => (
              <motion.li key={item.slug} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={SPRING}
                className={SPAN[item.card.span]}>
                <ComponentCard item={item} />
              </motion.li>
            ))}
            {!searching && (
              <li className="lg:col-span-2">
                <button type="button" onClick={() => setSubmitting(true)} className="group flex h-full min-h-[12rem] w-full flex-col items-center justify-center gap-3 rounded-[28px] bg-foreground/[0.025] p-5 text-center transition-colors hover:bg-foreground/[0.05] sm:min-h-[20rem]">
                  <span className="flex size-12 items-center justify-center rounded-full bg-foreground/[0.06] text-t2 transition-transform group-hover:scale-105"><AddIcon className="size-5" aria-hidden /></span>
                  <span className="text-sm font-medium">Submit yours</span>
                  <span className="max-w-[16rem] text-xs text-t3">Share a component with the circle.</span>
                </button>
              </li>
            )}
          </AnimatePresence>
        </ul>
      )}
      <SubmitDialog open={submitting} onOpenChange={setSubmitting} />
    </div>
  );
}

/**
 * A live tile: the component runs and responds right on the grid (draw track, hover the folder, scroll
 * the deck). Its preview keeps the component's own shape; the name row underneath opens its page.
 */
function ComponentCard({ item }: { item: LibraryItem }) {
  const thumb = item.thumbWidth ?? item.designWidth;
  const aspect = item.card.aspect;
  return (
    <article className="surface flex h-full flex-col rounded-[28px] p-2">
      <div className={cn("relative overflow-hidden rounded-[22px] bg-[#0b0d12]", !aspect && "min-h-[20rem] flex-1")} style={aspect ? { aspectRatio: aspect } : undefined}>
        {thumb
          ? <ScaledPreview width={thumb} height={item.designHeight} interactive fill className="!absolute inset-0"><item.Demo theme="dark" /></ScaledPreview>
          : <div className="absolute inset-0 flex items-center justify-center"><item.Demo theme="dark" /></div>}
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[70%] flex-wrap justify-end gap-1">
          {[item.category, ...item.tags.slice(0, 2)].map((tag) => (
            <span key={tag} className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-md">{tag}</span>
          ))}
        </div>
      </div>
      <Link
        to={`/components/${item.slug}`}
        aria-label={item.name}
        className="group mt-1 flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-[20px] px-3 py-2 transition-colors [outline-style:none] hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        <span className="truncate font-medium tracking-tight">{item.name}</span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-t3 transition-colors group-hover:text-foreground" aria-hidden>
          Open<AltArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </article>
  );
}

/* ---------- Preview page ---------- */

function Detail({ slug }: { slug: string }) {
  const item = findItem(slug);
  const index = item ? LIBRARY.indexOf(item) : -1;
  const [tab, setTab] = useState("preview");
  const [canvas, setCanvas] = useState<CanvasTheme>("dark");
  const [run, setRun] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => { setTab("preview"); setRun(0); setFullscreen(false); }, [slug]);
  useEffect(() => {
    if (!item) return;
    const previous = document.title;
    document.title = `${item.name} · Components · OpenCircle`;
    return () => { document.title = previous; };
  }, [item]);

  if (!item) {
    return (
      <EmptyState icon={<Widget4Icon className="size-8" />} title="This component isn't here" description="It may have been renamed or removed.">
        <Link to="/components" className="forum-action inline-flex items-center">All components</Link>
      </EmptyState>
    );
  }

  const previous = LIBRARY[index - 1];
  const next = LIBRARY[index + 1];

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      {/* Wide screens only: phones move between components with the links at the bottom. */}
      <ComponentNav current={item.slug} />

      <div className="min-w-0 space-y-5">
        <div className="space-y-2">
          <Link to="/components" className="inline-flex min-h-9 items-center gap-1 text-sm text-t3 hover:text-foreground lg:hidden">
            <AltArrowLeftIcon className="size-4" aria-hidden />All components
          </Link>
          <h1 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{item.name}</h1>
          <p className="max-w-xl text-sm leading-relaxed text-t3">{item.description}</p>
          {item.credit && (
            <p className="text-xs text-t4">
              {item.creditUrl
                ? <a href={item.creditUrl} target="_blank" rel="noreferrer" className="underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground">{item.credit}</a>
                : item.credit}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[item.category, ...item.tags].map((tag) => <span key={tag} className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-t2">{tag}</span>)}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label="View">
              {(["preview", "code"] as const).map((value) => (
                <TabsTrigger key={value} value={value}>
                  {tab === value && <motion.span layoutId="library-tab-pill" className="absolute inset-0 rounded-full bg-foreground/[0.1]" transition={SPRING} />}
                  <span className="relative">{value === "preview" ? "Preview" : "Code"}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <CopyMenu options={[
              { id: "markdown", label: "Copy Markdown", text: () => itemMarkdown(item), done: "Markdown copied." },
              { id: "code", label: "Copy code", text: () => item.source, done: `${item.file} copied.` },
            ]} />
          </div>

          <TabsContent value="preview" className="mt-3">
            <div
              className={cn("relative overflow-x-auto rounded-[28px] p-2 transition-colors duration-300 sm:p-4", canvas === "dark" ? "bg-[#0b0d12]" : "bg-[#f3f5f9]")}
              style={canvasBackground(canvas)}
            >
              <PreviewControls canvas={canvas} onCanvas={setCanvas} onReplay={() => setRun((value) => value + 1)} onExpand={() => setFullscreen(true)} className="absolute right-3 top-3" />
              <motion.div
                key={`${item.slug}-${run}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className={cn("flex min-h-[22rem] w-full items-center justify-center", !item.designHeight && "pt-10 sm:pt-6")}
                data-testid="preview-stage"
              >
                {/* Full-width components keep their real layout and scale down to the canvas. */}
                {item.designWidth
                  ? <ScaledPreview width={item.designWidth} height={item.designHeight} interactive className={cn("w-full", item.designHeight && "overflow-hidden rounded-[20px]")}><item.Demo theme={canvas} /></ScaledPreview>
                  : <div className="w-full"><item.Demo theme={canvas} /></div>}
              </motion.div>
            </div>
          </TabsContent>

          {fullscreen && <FullscreenPreview item={item} canvas={canvas} onCanvas={setCanvas} onClose={() => setFullscreen(false)} />}

          <TabsContent value="code" className="mt-3 space-y-4">
            <CodeView code={item.usage} label="Usage" maxHeight="16rem" />
            <CodeView code={item.source} label={item.file} />
          </TabsContent>
        </Tabs>

        {(previous || next) && (
          <nav aria-label="More components" className="flex items-center justify-between gap-3 pt-2">
            {previous ? <Link to={`/components/${previous.slug}`} className="forum-action inline-flex items-center gap-1"><AltArrowLeftIcon className="size-4" aria-hidden />{previous.name}</Link> : <span />}
            {next && <Link to={`/components/${next.slug}`} className="forum-action inline-flex items-center gap-1">{next.name}<AltArrowRightIcon className="size-4" aria-hidden /></Link>}
          </nav>
        )}
      </div>
    </div>
  );
}

/** Canvas theme, replay, and full screen (or close, inside full screen), floating over the canvas. */
function PreviewControls({ canvas, onCanvas, onReplay, onExpand, onClose, closeRef, className }: {
  canvas: CanvasTheme;
  onCanvas: (canvas: CanvasTheme) => void;
  onReplay: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  closeRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  const button = cn("flex size-8 items-center justify-center rounded-full transition-colors", canvas === "dark" ? "hover:bg-white/10 hover:text-white" : "hover:bg-black/[0.06] hover:text-slate-900");
  return (
    <div role="toolbar" aria-label="Preview controls" className={cn("z-20 flex items-center gap-0.5 rounded-full p-1 backdrop-blur-md", canvas === "dark" ? "bg-white/[0.08] text-white/70" : "bg-black/[0.06] text-slate-600", className)}>
      <button type="button" aria-label={canvas === "dark" ? "Light canvas" : "Dark canvas"} title={canvas === "dark" ? "Light canvas" : "Dark canvas"} onClick={() => onCanvas(canvas === "dark" ? "light" : "dark")} className={button}>
        {canvas === "dark" ? <Sun2Icon className="size-4" aria-hidden /> : <MoonIcon className="size-4" aria-hidden />}
      </button>
      <button type="button" aria-label="Replay" title="Replay" onClick={onReplay} className={button}>
        <RestartIcon className="size-4" aria-hidden />
      </button>
      {onExpand && (
        <button type="button" aria-label="Full screen" title="Full screen" onClick={onExpand} className={button}>
          <FullScreenIcon className="size-4" aria-hidden />
        </button>
      )}
      {onClose && (
        <button ref={closeRef} type="button" aria-label="Close full screen" title="Close (Esc)" onClick={onClose} className={button}>
          <CloseCircleIcon className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** The component on its own, filling the screen. Esc or the close button returns to the page. */
function FullscreenPreview({ item, canvas, onCanvas, onClose }: { item: LibraryItem; canvas: CanvasTheme; onCanvas: (canvas: CanvasTheme) => void; onClose: () => void }) {
  const [run, setRun] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      opener?.focus();
    };
  }, []);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${item.name}, full screen`} className={cn("fixed inset-0 z-[100] flex", canvas === "dark" ? "bg-[#0b0d12]" : "bg-[#f3f5f9]")} style={canvasBackground(canvas)}>
      <PreviewControls canvas={canvas} onCanvas={onCanvas} onReplay={() => setRun((value) => value + 1)} onClose={onClose} closeRef={closeRef} className="fixed right-4 top-[calc(1rem+env(safe-area-inset-top))]" />
      <div key={run} className="flex h-full w-full items-center justify-center overflow-auto">
        {/* A whole-screen design (a hero) takes the real screen here; full-width pieces still scale to fit. */}
        {item.designWidth && !item.designHeight
          ? <ScaledPreview width={item.designWidth} interactive className="w-full"><item.Demo theme={canvas} fullscreen /></ScaledPreview>
          : <item.Demo theme={canvas} fullscreen />}
      </div>
    </div>,
    document.body,
  );
}

/**
 * One component alone on a 1200 × 630 frame, for its share image. It plays the component's
 * `og` hints (trace a pointer path, scroll its scroller), waits to settle, then sets
 * `window.__ogReady` for scripts/capture-component-og.mjs to take the shot.
 */
function OgFrame({ slug }: { slug: string }) {
  const item = findItem(slug);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = frame.current;
    if (!item || !root) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    void (async () => {
      await document.fonts?.ready;
      await wait(400);
      const og = item.og ?? {};
      if (og.scroll !== undefined) {
        const scroller = [...root.querySelectorAll<HTMLElement>("*")].find((element) => element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY));
        if (scroller) scroller.scrollTop = og.scroll * (scroller.scrollHeight - scroller.clientHeight);
      }
      const path = og.pointer ?? [];
      if (path.length > 1) {
        const rect = root.getBoundingClientRect();
        const duration = og.duration ?? 2000;
        const start = performance.now();
        await new Promise<void>((done) => {
          const step = () => {
            const t = Math.min(1, (performance.now() - start) / duration);
            const along = t * (path.length - 1);
            const index = Math.min(path.length - 2, Math.floor(along));
            const f = along - index;
            const x = rect.left + rect.width * (path[index][0] + (path[index + 1][0] - path[index][0]) * f);
            const y = rect.top + rect.height * (path[index][1] + (path[index + 1][1] - path[index][1]) * f);
            document.elementFromPoint?.(x, y)?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerType: "mouse" }));
            if (t < 1 && !cancelled) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        });
      }
      await wait(og.settle ?? 1800);
      if (cancelled) return;
      root.dataset.ready = "true";
      (window as Window & { __ogReady?: boolean }).__ogReady = true;
    })();
    return () => { cancelled = true; };
  }, [item]);

  if (!item) return null;
  const scaled = item.designWidth && !item.designHeight;
  return (
    <div ref={frame} className="relative h-[630px] w-[1200px] overflow-hidden bg-[#0b0d12] text-white" style={canvasBackground("dark")}>
      <div className="absolute inset-0 flex items-center justify-center">
        {scaled
          ? <div className="w-full px-10"><ScaledPreview width={item.designWidth!} interactive className="w-full overflow-hidden rounded-[24px]"><item.Demo theme="dark" /></ScaledPreview></div>
          : <div className="h-full w-full"><item.Demo theme="dark" fullscreen /></div>}
      </div>
      <div className="pointer-events-none absolute bottom-6 left-6 z-50 flex items-center gap-3 rounded-full bg-black/60 py-2 pl-2 pr-5 backdrop-blur-md">
        <span className="flex size-9 items-center justify-center rounded-full bg-white/10"><Widget4Icon className="size-5 text-white/80" /></span>
        <span className="text-[15px] font-medium tracking-tight">{item.name}</span>
        <span className="text-[13px] text-white/55">OpenCircle Components</span>
      </div>
    </div>
  );
}

/** Every component in a sticky column at the far left, for scrolling between them on wide screens. */
function ComponentNav({ current }: { current: string }) {
  return (
    <aside aria-label="Components" className="hidden min-w-0 lg:sticky lg:top-24 lg:block lg:self-start">
      <Link to="/components" className="mb-3 inline-flex items-center gap-1 text-sm text-t3 hover:text-foreground">
        <AltArrowLeftIcon className="size-4" aria-hidden />All components
      </Link>
      <ul className="flex max-h-[calc(100dvh-10rem)] flex-col gap-1.5 overflow-y-auto">
        {LIBRARY.map((item) => {
          const active = item.slug === current;
          return (
            <li key={item.slug}>
              <Link
                to={`/components/${item.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-10 items-center rounded-2xl px-3.5 text-sm transition-colors", active ? "text-foreground" : "text-t3 hover:text-foreground")}
              >
                {active && <motion.span layoutId="library-nav-pill" className="absolute inset-0 rounded-[inherit] bg-foreground/[0.08]" transition={SPRING} />}
                <span className="relative truncate">{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
