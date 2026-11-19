/* Scroll Deck: a pinned, scroll-scrubbed hero where the cards are the show.
   Cards rise in fanned along the bottom under a big intro line. Scrolling blows
   the intro away and scatters the cards around the screen, tumbling in depth,
   while a second headline reveals word by word. The cards then sweep back into
   a fan below it (edges first) and the whole fan turns on its pivot.
   Between scrolls the cards stay alive: a resting tilt, a slow wobble, pointer
   parallax and a sheen that follows each card's angle.
   Self-contained React + Tailwind: CSS 3D transforms written to the cards each
   frame. No other packages. */

import * as React from "react";

export type DeckCard = {
  name: string;
  /** Small print along the bottom, like a web address. */
  caption?: string;
  icon: React.ReactNode;
  /** Gradient from top-left to bottom-right. */
  colors: [string, string];
};

export type ScrollDeckProps = {
  cards: DeckCard[];
  /** The big first line. */
  intro: React.ReactNode;
  /** Small line under the intro, e.g. a link pill. */
  introNote?: React.ReactNode;
  /** The second headline, split around the cycling icon. Wrap words in ~tildes~ to mute them. */
  headline: [string, string];
  subtitle?: React.ReactNode;
  /** Buttons or links under the second headline. */
  actions?: React.ReactNode;
  /** "contained" scrolls inside its own box (give it a height); "page" pins to the window while you scroll. */
  scroll?: "contained" | "page";
  /** How many screens of scrolling the sequence takes. */
  length?: number;
  theme?: "light" | "dark";
  className?: string;
};

type Pose = [x: number, y: number, rotation: number];

/* ---------- Choreography ---------- */

// The timeline runs in beats; scroll progress maps onto 0…END.
const END = 5.7;
const SCRUB = 6; // how quickly the cards catch up with the scroll, per second

// Seven slots, tuned as a set. Positions are fractions of the stage, from its centre.
const INTRO_DROP = [0, 0.02, 0.06, 0.11]; // how much lower each step from the middle sits
const SCATTER: Pose[] = [[-0.36, -0.05, -14], [-0.31, -0.36, 10], [0.3, -0.37, -8], [-0.22, 0.36, 8], [0.28, 0.34, -10], [0.41, 0, 12], [-0.45, 0.28, -18]];
const SCATTER_NARROW: Pose[] = [[-0.4, -0.36, -14], [0.38, -0.38, 10], [-0.44, 0.3, 8], [-0.3, 0.36, 10], [0.3, 0.38, -8], [0.02, -0.44, -6], [0.05, 0.46, 4]];
// Each card's tumble while scattered: tilt back, turn, and depth (in camera units).
const TUMBLE: [number, number, number][] = [[0.38, -0.55, 0.6], [-0.32, 0.5, -0.4], [0.42, 0.6, 1.2], [-0.45, -0.4, 0.2], [0.3, -0.62, 0.9], [-0.36, 0.52, -0.2], [0.5, 0.34, 0.4]];

// The camera: 32° field of view from 10 units away, so the stage is 5.735 units tall.
const VIEW_HEIGHT = 2 * 10 * Math.tan((16 * Math.PI) / 180);

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const beat = (t: number, start: number, duration: number) => clamp01((t - start) / duration);
const ease = {
  in3: (t: number) => t * t * t,
  out4: (t: number) => 1 - Math.pow(1 - t, 4),
  inOut4: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** Splits "~From~ a real problem" into words, muting the ones inside tildes. */
function words(text: string) {
  const out: { text: string; muted: boolean }[] = [];
  let muted = false;
  for (const chunk of text.split(/(~)/)) {
    if (chunk === "~") { muted = !muted; continue; }
    for (const word of chunk.split(/\s+/).filter(Boolean)) out.push({ text: word, muted });
  }
  return out;
}

/* ---------- Pieces ---------- */

function Card({ card, mark, sheen }: { card: DeckCard; mark: React.ReactNode; sheen: (element: HTMLDivElement | null) => void }) {
  // Proportions follow a 300 × 400 card face.
  const u = (value: number) => `calc(var(--cw) * ${value / 300})`;
  return (
    <div
      className="absolute inset-0 overflow-hidden text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]"
      style={{ background: `linear-gradient(160deg, ${card.colors[0]}, ${card.colors[1]})`, borderRadius: u(22) }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_15%_0%,rgba(255,255,255,.2),transparent_60%)]" />
      <div ref={sheen} className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,.22)_47%,transparent_58%)] bg-[length:260%_100%] mix-blend-screen" />
      <span className="absolute font-semibold leading-none [writing-mode:vertical-rl]" style={{ top: u(22), right: u(22), fontSize: u(46), letterSpacing: u(-1) }}>
        {card.name}
      </span>
      <span className="absolute flex items-center justify-center bg-white/15 [&_svg]:size-[58%]" style={{ left: u(22), top: u(136), width: u(66), height: u(66), borderRadius: u(17) }}>
        {card.icon}
      </span>
      {card.caption && (
        <span className="absolute font-semibold uppercase text-white/80" style={{ left: u(22), bottom: u(18), fontSize: u(11), letterSpacing: u(1.6) }}>
          {card.caption}
        </span>
      )}
      <span className="absolute text-white/50 [&_svg]:size-full" style={{ right: u(22), bottom: u(18), width: u(15), height: u(15) }}>{mark}</span>
    </div>
  );
}

/** The inline tile in the headline, flipping through each card's icon in turn. */
function CyclingIcon({ cards }: { cards: DeckCard[] }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (cards.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % cards.length), 1800);
    return () => window.clearInterval(timer);
  }, [cards.length]);
  const card = cards[index % Math.max(1, cards.length)];
  if (!card) return null;
  return (
    <span className="relative inline-flex size-[1em] translate-y-[0.12em] align-baseline [perspective:400px]">
      <span
        key={index}
        className="absolute inset-0 flex items-center justify-center rounded-[24%] text-white shadow-[0_12px_28px_-12px_rgba(0,0,0,.55)] motion-safe:animate-[deck-flip_.5s_cubic-bezier(.16,1,.3,1)] [&_svg]:size-[55%]"
        style={{ background: `linear-gradient(160deg, ${card.colors[0]}, ${card.colors[1]})` }}
      >
        {card.icon}
      </span>
    </span>
  );
}

/* ---------- Component ---------- */

export function ScrollDeck({
  cards,
  intro,
  introNote,
  headline,
  subtitle,
  actions,
  scroll = "contained",
  length = 3.4,
  theme = "light",
  className = "",
}: ScrollDeckProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const track = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const layer = React.useRef<HTMLDivElement>(null);
  const introRef = React.useRef<HTMLDivElement>(null);
  const hint = React.useRef<HTMLDivElement>(null);
  const copy = React.useRef<HTMLDivElement>(null);
  const wordRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const extras = React.useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const sheenRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const pointer = React.useRef({ x: 0, y: 0 });
  const dark = theme === "dark";
  const contained = scroll === "contained";
  const count = cards.length;
  const lead = words(headline[0]);
  const trail = words(headline[1]);

  React.useEffect(() => {
    const box = root.current;
    const view = stage.current;
    const space = track.current;
    const cardLayer = layer.current;
    if (!box || !view || !space || !cardLayer) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mid = (count - 1) / 2;
    let width = 0;
    let height = 0;
    let cardWidth = 0;
    let narrow = false;
    let target = 0;
    let shown = 0;
    let frame = 0;
    let previous = 0;
    let visible = true;
    let born = -1; // when the cards started rising in, in seconds
    const eased = { x: 0, y: 0 };

    // Slot order on the intro fan is shifted by one from the final fan, so cards cross as they sweep.
    const introPose = (index: number): Pose => {
      const slot = ((index + 1) % count) - mid;
      const step = Math.abs(slot);
      const drop = step < INTRO_DROP.length ? INTRO_DROP[step] : INTRO_DROP[INTRO_DROP.length - 1] + (step - 3) * 0.06;
      return [slot * (narrow ? 0.15 : 0.11) * width, (0.35 + drop) * height, slot * 5];
    };
    const scatterPose = (index: number): Pose => {
      const table = narrow ? SCATTER_NARROW : SCATTER;
      const [x, y, r] = table[index % table.length];
      const flip = Math.floor(index / table.length) % 2 ? -1 : 1; // past seven cards, mirror the set
      return [x * flip * width, y * height, r * flip];
    };
    const fan = () => {
      const radius = height * (narrow ? 0.8 : 1.18);
      const pivot = height * (narrow ? 0.62 : 0.6) + (cardWidth * 4) / 3 / 2 + radius - height / 2;
      return { radius, pivot, spread: narrow ? 9 : 10.5 };
    };
    const fanPose = (index: number): Pose => {
      const { radius, pivot, spread } = fan();
      const angle = (index - mid) * spread;
      const radians = (angle * Math.PI) / 180;
      return [Math.sin(radians) * radius, pivot - Math.cos(radians) * radius, angle];
    };

    const measure = () => {
      if (contained) {
        space.style.height = `${box.clientHeight * (length + 1)}px`;
        view.style.height = `${box.clientHeight}px`;
      }
      width = view.clientWidth;
      height = view.clientHeight;
      narrow = width < 768;
      cardWidth = narrow ? Math.min(150, Math.max(104, width * 0.3)) : Math.min(236, Math.max(112, width * 0.15));
      view.style.setProperty("--cw", `${cardWidth}px`);
      view.style.setProperty("--stage-w", `${width}px`);
      cardLayer.style.perspective = `${(10 * height) / VIEW_HEIGHT}px`;
    };

    const progress = () => {
      if (contained) return clamp01(box.scrollTop / Math.max(1, box.scrollHeight - box.clientHeight));
      const rect = space.getBoundingClientRect();
      return clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight));
    };

    const render = (now: number) => {
      if (!width || !height) return;
      const t = shown * END;
      const unit = height / VIEW_HEIGHT; // pixels per camera unit
      const age = born < 0 ? 0 : now - born;

      // The cards: intro → scatter (centre first) → fan (edges first) → the fan turns.
      const spread = ease.out4(beat(t, 0.25, 1.7)) * (1 - ease.inOut4(beat(t, 2.7, 1.3)));
      const turn = -14 * ease.sine(beat(t, 4.3, 1.4));
      const turnRadians = (turn * Math.PI) / 180;
      const { pivot } = fan();
      const ranks = Array.from({ length: count }, (_, index) => Math.abs(index - mid));
      cardRefs.current.forEach((element, index) => {
        if (!element) return;
        const out = ease.out4(beat(t, 0.25 + 0.04 * ranks[index], 1.7));
        const back = ease.inOut4(beat(t, 2.7 + 0.05 * (mid - ranks[index]), 1.5));
        const a = introPose(index);
        const b = scatterPose(index);
        const c = fanPose(index);
        let x = mix(mix(a[0], b[0], out), c[0], back);
        let y = mix(mix(a[1], b[1], out), c[1], back);
        const rotation = mix(mix(a[2], b[2], out), c[2], back) + turn;
        const scale = mix(mix(1, narrow ? 1 : 1.05, out), 1, back);
        // Turn the fan around its pivot below the stage.
        const dy = y - pivot;
        [x, y] = [x * Math.cos(turnRadians) - dy * Math.sin(turnRadians), pivot + x * Math.sin(turnRadians) + dy * Math.cos(turnRadians)];

        // Depth and tilt, as a camera would see a card in 3D.
        const [tiltBack, twist, depth] = TUMBLE[index % TUMBLE.length];
        const base = 0.07 * index;
        const z = base + spread * depth;
        const fit = (10 - base) / 10; // keep the base stack the same size on screen
        const delay = 0.05 + 0.075 * ranks[index];
        const rise = still ? 0 : Math.pow(1 - clamp01((age - delay) / 1.25), 4);
        const spin = still ? 0 : Math.pow(1 - clamp01((age - delay) / 1.6), 3);
        const wobble = still ? 0 : 0.018 + 0.06 * spread;
        const tiltX = mix(0.12, tiltBack, spread) + 0.14 * eased.y + Math.sin(0.7 * now + 1.7 * index) * wobble;
        const tiltY = mix(0, twist, spread) + 0.2 * eased.x + Math.cos(0.55 * now + 2.3 * index) * wobble - 2.4 * spin;
        const px = x * fit + eased.x * z * 0.06 * unit;
        const py = y * fit + rise * 0.85 * height + eased.y * z * 0.04 * unit;
        element.style.transform = `translate(-50%, -50%) translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, ${(z * unit).toFixed(1)}px) rotateX(${(-tiltX).toFixed(4)}rad) rotateY(${tiltY.toFixed(4)}rad) rotateZ(${((rotation * Math.PI) / 180 - 0.35 * rise).toFixed(4)}rad) scale(${(scale * fit).toFixed(4)})`;

        // A soft contact shadow, squashed as the card turns away.
        const shadow = shadowRefs.current[index];
        if (shadow) {
          const sx = Math.max(0.35, Math.abs(Math.cos(tiltY)));
          const sy = Math.max(0.35, Math.abs(Math.cos(tiltX)));
          shadow.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${(y + 0.035 * cardWidth * (1 + z) + cardWidth * 0.1 + rise * height).toFixed(1)}px) rotate(${rotation.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
          shadow.style.opacity = String(((dark ? 0.5 : 0.22) * (1 - rise) * (1 - 0.35 * spread)).toFixed(3));
        }
        const sheen = sheenRefs.current[index];
        if (sheen) sheen.style.backgroundPosition = `${(50 + tiltY * 70 - tiltX * 30).toFixed(1)}% 0`;
      });

      // The intro line blows away; the scroll hint fades.
      const gone = ease.in3(beat(t, 0, 1.2));
      if (introRef.current) {
        introRef.current.style.opacity = String(1 - gone);
        introRef.current.style.transform = `translateY(${-120 * gone}%) scale(${1 - 0.4 * gone})`;
        introRef.current.style.filter = gone > 0.01 ? `blur(${(10 * gone).toFixed(1)}px)` : "";
      }
      if (hint.current) {
        const fade = beat(t, 0, 0.4);
        hint.current.style.opacity = String(1 - fade);
        hint.current.style.transform = `translateY(${20 * fade}px)`;
      }

      // The headline reveals word by word, then its subtitle and actions, then rises.
      wordRefs.current.forEach((element, index) => {
        if (!element) return;
        const reveal = ease.out4(beat(t, 1.3 + 0.06 * index, 0.7));
        element.style.opacity = String(reveal);
        element.style.transform = `translateY(${(70 * (1 - reveal)).toFixed(1)}%)`;
        element.style.filter = reveal < 0.99 ? `blur(${(8 * (1 - reveal)).toFixed(1)}px)` : "";
      });
      extras.current.forEach((element, index) => {
        if (!element) return;
        const reveal = 1 - Math.pow(1 - beat(t, 2.1 + 0.12 * index, 0.6), 3);
        element.style.opacity = String(reveal);
        element.style.transform = `translateY(${(24 * (1 - reveal)).toFixed(1)}px)`;
      });
      if (copy.current) {
        const rise = ease.inOut4(beat(t, 2.7, 1.3));
        copy.current.style.transform = `translateY(${(-rise * height * (narrow ? 0.15 : 0.18)).toFixed(1)}px)`;
        copy.current.style.pointerEvents = t > 1.6 ? "auto" : "none";
      }
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const now = time / 1000;
      const dt = previous ? Math.min(0.05, now - previous) : 1 / 60;
      previous = now;
      if (!visible) return;
      if (born < 0) born = now;
      shown = still ? target : shown + (target - shown) * (1 - Math.exp(-dt * SCRUB));
      if (Math.abs(target - shown) < 0.0002) shown = target;
      const follow = 1 - Math.pow(0.002, dt);
      eased.x += (pointer.current.x - eased.x) * follow;
      eased.y += (pointer.current.y - eased.y) * follow;
      render(now);
    };

    const onScroll = () => { target = progress(); };
    measure();
    target = progress();
    shown = target;
    render(performance.now() / 1000);
    const sizer = new ResizeObserver(() => { measure(); render(performance.now() / 1000); });
    sizer.observe(box);
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    watcher.observe(view);
    const source: HTMLElement | Window = contained ? box : window;
    source.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      watcher.disconnect();
      source.removeEventListener("scroll", onScroll);
    };
  }, [contained, count, length, dark]);

  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: ((event.clientY - rect.top) / rect.height) * 2 - 1 };
  };

  const mark = (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="8" r="7" fillOpacity=".35" />
      <circle cx="8" cy="8" r="3.2" />
    </svg>
  );
  let wordIndex = 0;
  const wordRef = () => {
    const index = wordIndex++;
    return (element: HTMLSpanElement | null) => { wordRefs.current[index] = element; };
  };
  const renderWords = (list: { text: string; muted: boolean }[]) =>
    list.map((word, index) => (
      <React.Fragment key={index}>
        <span ref={wordRef()} className={`inline-block opacity-0 ${word.muted ? "[color:color-mix(in_oklab,currentColor_45%,transparent)]" : ""}`}>{word.text}</span>{" "}
      </React.Fragment>
    ));

  return (
    <div
      ref={root}
      onPointerMove={onPointer}
      onPointerLeave={() => { pointer.current = { x: 0, y: 0 }; }}
      className={`relative w-full ${contained ? "h-full min-h-[30rem] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""} ${dark ? "bg-[#0d0e12] text-white" : "bg-[#efefed] text-neutral-950"} ${className}`}
    >
      <style>{"@keyframes deck-flip{from{transform:rotateX(-90deg);opacity:0}to{transform:rotateX(0);opacity:1}}"}</style>
      <div ref={track} style={contained ? undefined : { height: `${(length + 1) * 100}svh` }}>
        <div ref={stage} className={`sticky top-0 isolate w-full overflow-hidden ${contained ? "" : "h-svh"}`}>
          <div ref={introRef} className="absolute inset-x-0 top-[34%] z-30 flex flex-col items-center px-4 text-center will-change-transform md:top-[30%]">
            <h2 className="font-semibold leading-[0.92] tracking-[-0.055em]" style={{ fontSize: "clamp(3rem, calc(var(--stage-w) * 0.115), 10.5rem)" }}>{intro}</h2>
            {introNote && <div className="mt-6">{introNote}</div>}
          </div>

          <div ref={copy} className="pointer-events-none absolute inset-x-0 top-[30%] z-20 flex flex-col items-center px-4 text-center md:top-[33%]">
            <h2 className="max-w-[20ch] font-semibold leading-[1.02] tracking-[-0.045em]" style={{ fontSize: "clamp(1.9rem, calc(var(--stage-w) * 0.047), 4.9rem)" }}>
              {renderWords(lead)}
              <span ref={wordRef()} className="inline-block opacity-0"><CyclingIcon cards={cards} /></span>{" "}
              {renderWords(trail)}
            </h2>
            {subtitle && <div ref={(element) => { extras.current[0] = element; }} className={`mt-5 max-w-md text-[0.95rem] leading-relaxed opacity-0 ${dark ? "text-white/60" : "text-neutral-600"}`}>{subtitle}</div>}
            {actions && <div ref={(element) => { extras.current[1] = element; }} className="mt-6 flex flex-wrap items-center justify-center gap-3 opacity-0">{actions}</div>}
          </div>

          {/* Shadows lie flat under the cards; the cards themselves live in 3D. */}
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
            {cards.map((card, index) => (
              <div
                key={`shadow-${card.name}-${index}`}
                ref={(element) => { shadowRefs.current[index] = element; }}
                className="absolute left-1/2 top-1/2 rounded-[10%] bg-black opacity-0 blur-[14px]"
                style={{ width: "var(--cw)", height: "calc(var(--cw) * 4 / 3)" }}
              />
            ))}
          </div>
          <div ref={layer} className="pointer-events-none absolute inset-0 z-10 [transform-style:preserve-3d]" aria-hidden>
            {cards.map((card, index) => (
              <div
                key={`${card.name}-${index}`}
                ref={(element) => { cardRefs.current[index] = element; }}
                className="absolute left-1/2 top-1/2 will-change-transform"
                style={{ width: "var(--cw)", height: "calc(var(--cw) * 4 / 3)", transform: "translate(-50%, -50%) translateY(120vh)" }}
              >
                <Card card={card} mark={mark} sheen={(element) => { sheenRefs.current[index] = element; }} />
              </div>
            ))}
          </div>

          <div ref={hint} className={`pointer-events-none absolute right-5 top-[38%] z-30 hidden flex-col items-center gap-3 text-[10px] uppercase tracking-[0.3em] md:flex ${dark ? "text-white/45" : "text-neutral-500"}`} aria-hidden>
            <span className="[writing-mode:vertical-rl]">Scroll</span>
            <span className="h-10 w-px bg-current" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScrollDeck;
