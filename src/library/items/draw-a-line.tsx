/* Draw a Line: move across the card to lay track; a little train follows it,
   puffing your app icons out of its chimney as it goes. When nobody is drawing,
   the train finishes its run and the track fades away.
   Self-contained React + Tailwind: the track is a canvas, the train and the
   puffed icons are plain elements moved each frame. No other packages. */

import * as React from "react";

export type TrainCargo = {
  icon: React.ReactNode;
  /** Any CSS background: a colour or a gradient. */
  color: string;
  label?: string;
};

export type DrawALineProps = {
  /** Two parts: the second is shown muted, e.g. ["Draw a", "line."]. */
  title?: [string, string];
  description?: string;
  /** Icons the wagons carry and the chimney puffs out. */
  cargo: TrainCargo[];
  /** Train colour. */
  color?: string;
  theme?: "light" | "dark";
  className?: string;
};

type Point = { x: number; y: number; d: number };
type Puff = { id: number; x: number; y: number; dx: number; dy: number; rot: number; cargo: number };

const GAUGE = 6; // half the distance between the rails
const TIE_GAP = 13;
const TIE_HALF = 11;
const LEAD = 34; // how far the engine stays behind the cursor
// Each car: its centre's distance behind the engine's nose, its size and where its wheels meet the track.
const CARS = [
  { back: 24, width: 48, height: 30, rail: 27 },
  { back: 70, width: 36, height: 30, rail: 27 },
  { back: 110, width: 36, height: 30, rail: 27 },
];
const TAIL = CARS[CARS.length - 1].back + 70;
const IDLE_MS = 1200; // no drawing for this long, and the train at rest: everything fades
const FADE_S = 0.7;

/** The point and heading at distance `d` along the track. */
function at(points: Point[], d: number) {
  const last = points.length - 1;
  if (d <= points[0].d) return points[0];
  if (d >= points[last].d) return points[last];
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].d <= d) low = mid;
    else high = mid;
  }
  const a = points[low];
  const b = points[high];
  const t = (d - a.d) / (b.d - a.d || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d };
}

function heading(points: Point[], d: number) {
  const ahead = at(points, d + 8);
  const behind = at(points, d - 8);
  return Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
}

function Engine({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 30" width={48} height={30} aria-hidden>
      <rect x="0.5" y="2" width="16" height="3.5" rx="1.75" fill="#111" />
      <rect x="2" y="4" width="13" height="18" rx="2.5" fill={color} />
      <rect x="5" y="7.5" width="7" height="6" rx="1.5" fill="#fff" opacity=".85" />
      <rect x="12" y="10" width="27" height="12" rx="6" fill={color} />
      <rect x="16" y="13" width="9" height="3" rx="1.5" fill="#fff" opacity=".45" />
      <path d="M26 10V5.5h-1.5L24 3h8l-.5 2.5H30V10z" fill="#111" />
      <circle cx="38.5" cy="16" r="6.5" fill="#fff" stroke="#111" strokeWidth="1.5" />
      <circle cx="36.6" cy="14.8" r="1.2" fill="#111" />
      <circle cx="40.4" cy="14.8" r="1.2" fill="#111" />
      <path d="M36.3 18.1q2.2 1.8 4.4 0" stroke="#111" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M43 21.5l4.5 4h-6z" fill="#111" />
      <rect x="2" y="21" width="41" height="2.5" rx="1.25" fill="#111" />
      {[9, 21, 32].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="25" r="4.2" fill="#111" />
          <circle cx={cx} cy="25" r="1.5" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

function Wagon({ color, cargo }: { color: string; cargo?: TrainCargo }) {
  return (
    <>
      <svg viewBox="0 0 36 30" width={36} height={30} aria-hidden>
        <rect x="-3" y="20" width="6" height="1.6" fill="#111" />
        <rect x="2" y="11" width="32" height="11" rx="3" fill={color} />
        <rect x="5" y="14.5" width="26" height="3" rx="1.5" fill="#fff" opacity=".55" />
        <rect x="1" y="21" width="34" height="2.5" rx="1.25" fill="#111" />
        {[9, 27].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="25" r="4" fill="#111" />
            <circle cx={cx} cy="25" r="1.4" fill="#fff" />
          </g>
        ))}
      </svg>
      {cargo && (
        <span className="absolute left-[9px] top-[-6px] flex size-[18px] items-center justify-center overflow-hidden rounded-[5px] text-white [&_svg]:size-3" style={{ background: cargo.color }}>
          {cargo.icon}
        </span>
      )}
    </>
  );
}

function PuffedIcon({ puff, cargo, onDone }: { puff: Puff; cargo: TrainCargo; onDone: (id: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function") { onDone(puff.id); return; }
    const place = (x: number, y: number, scale: number, rotate: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`;
    const animation = element.animate([
      { transform: place(puff.x, puff.y, 0.3, 0), opacity: 0 },
      { transform: place(puff.x + puff.dx * 0.55, puff.y + puff.dy * 0.55, 1, puff.rot * 0.6), opacity: 0.55, offset: 0.2 },
      { transform: place(puff.x + puff.dx, puff.y + puff.dy, 1, puff.rot), opacity: 0.35, offset: 0.6 },
      { transform: place(puff.x + puff.dx, puff.y + puff.dy - 18, 0.94, puff.rot), opacity: 0 },
    ], { duration: 2400, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
    animation.onfinish = () => onDone(puff.id);
    return () => animation.cancel();
  }, [puff, onDone]);

  return (
    <div ref={ref} className="pointer-events-none absolute left-0 top-0 flex size-12 items-center justify-center rounded-[14px] text-white opacity-0 [&_svg]:size-6" style={{ background: cargo.color }} aria-hidden>
      {cargo.icon}
    </div>
  );
}

export function DrawALine({
  title = ["Draw a", "line."],
  description = "Lay track with your cursor. The train hauls our apps along it, puffing them out as it goes.",
  cargo,
  color = "#5b30d6",
  theme = "light",
  className = "",
}: DrawALineProps) {
  const card = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const cars = React.useRef<(HTMLDivElement | null)[]>([]);
  const pointer = React.useRef<{ x: number; y: number } | null>(null);
  const lastInput = React.useRef(-Infinity);
  const [puffs, setPuffs] = React.useState<Puff[]>([]);
  const removePuff = React.useCallback((id: number) => setPuffs((all) => all.filter((puff) => puff.id !== id)), []);
  const dark = theme === "dark";
  const cargoCount = cargo.length;

  React.useEffect(() => {
    const root = card.current;
    const surface = canvas.current;
    if (!root || !surface) return;
    const context = surface.getContext("2d");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ties = dark ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.16)";
    const rails = dark ? "rgba(255,255,255,.72)" : "rgba(24,24,27,.78)";

    let points: Point[] = [];
    let head: { x: number; y: number } | null = null;
    let fade = 1;
    let s = 0;
    let speed = 0;
    let travelled = 0;
    let flip = 1;
    let puffId = 0;
    let previous = 0;
    let frame = 0;
    let visible = true;
    let width = 0;
    let height = 0;

    const lay = (x: number, y: number) => {
      const last = points[points.length - 1];
      if (!last) { points.push({ x, y, d: 0 }); s = 0; return; }
      const step = Math.hypot(x - last.x, y - last.y);
      if (step >= 4) points.push({ x, y, d: last.d + step });
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = root.clientWidth;
      height = root.clientHeight;
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      if (points.length < 2) return;
      context.globalAlpha = fade;
      const first = points[0].d;
      const end = points[points.length - 1].d;
      context.lineCap = "round";

      // Sleepers sit at fixed distances, so they stay put as the track is trimmed behind the train.
      context.strokeStyle = ties;
      context.lineWidth = 4;
      context.beginPath();
      for (let d = Math.ceil(first / TIE_GAP) * TIE_GAP; d <= end; d += TIE_GAP) {
        const p = at(points, d);
        const angle = heading(points, d);
        const nx = -Math.sin(angle) * TIE_HALF;
        const ny = Math.cos(angle) * TIE_HALF;
        context.moveTo(p.x - nx, p.y - ny);
        context.lineTo(p.x + nx, p.y + ny);
      }
      context.stroke();

      context.strokeStyle = rails;
      context.lineWidth = 2.4;
      context.lineJoin = "round";
      for (const side of [-1, 1]) {
        context.beginPath();
        for (let d = first; d <= end + 4.9; d += 5) {
          const p = at(points, Math.min(d, end));
          const angle = heading(points, Math.min(d, end));
          const x = p.x - Math.sin(angle) * GAUGE * side;
          const y = p.y + Math.cos(angle) * GAUGE * side;
          if (d === first) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }

      // Fade the far end of the track out behind the last wagon.
      const tail = points[0];
      const tailFade = context.createRadialGradient(tail.x, tail.y, 0, tail.x, tail.y, 70);
      tailFade.addColorStop(0, "rgba(0,0,0,1)");
      tailFade.addColorStop(1, "rgba(0,0,0,0)");
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = tailFade;
      context.fillRect(tail.x - 70, tail.y - 70, 140, 140);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
    };

    const place = () => {
      const ready = points.length > 1;
      const first = ready ? points[0].d : 0;
      if (ready) {
        // Keep the train upright: past vertical it turns around instead of riding upside down.
        const cos = Math.cos(heading(points, s - CARS[0].back));
        if (cos < -0.2) flip = -1;
        else if (cos > 0.2) flip = 1;
      }
      CARS.forEach((car, index) => {
        const element = cars.current[index];
        if (!element) return;
        const d = s - car.back;
        const shown = ready && d - car.width / 2 >= first;
        element.style.opacity = shown ? String(fade) : "0";
        if (!ready) return;
        const p = at(points, d);
        const angle = heading(points, d);
        element.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}rad) scale(1, ${flip}) translate(${-car.width / 2}px, ${-car.rail}px)`;
      });
    };

    const puff = () => {
      if (still || !cargoCount) return;
      const nose = at(points, s - CARS[0].back);
      const angle = heading(points, s - CARS[0].back);
      // The chimney sits a little forward of the engine's centre, above the track.
      const x = nose.x + Math.cos(angle) * 4 + Math.sin(angle) * 22 * flip;
      const y = nose.y + Math.sin(angle) * 4 - Math.cos(angle) * 22 * flip;
      const id = ++puffId;
      setPuffs((all) => [...all.slice(-7), {
        id, x, y,
        dx: (Math.random() - 0.5) * 180,
        dy: -70 - Math.random() * 90,
        rot: (Math.random() - 0.5) * 50,
        cargo: id % cargoCount,
      }]);
    };

    const step = (time: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(0.05, previous ? (time - previous) / 1000 : 0);
      previous = time;
      if (!visible || document.hidden || width === 0) return;

      // The head of the track eases after the cursor, so quick flicks still lay smooth curves.
      const target = pointer.current;
      const drawing = performance.now() - lastInput.current <= IDLE_MS;
      if (target) {
        // Only movement brings the track back; a cursor resting on the card lets it fade.
        if (drawing) fade = 1;
        const from = head ?? target;
        const ease = 1 - Math.exp(-dt * 18);
        head = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease };
        lay(head.x, head.y);
      }

      if (points.length > 1) {
        const goal = Math.max(0, points[points.length - 1].d - LEAD);
        const wanted = Math.min(560, Math.max(0, (goal - s) * 2.6));
        speed += (wanted - speed) * (1 - Math.exp(-dt * 4));
        s = Math.min(goal, s + speed * dt);
        travelled += speed * dt;
        if (travelled > 170 && speed > 60) { travelled = 0; puff(); }
        // Drop track the train has left behind.
        while (points.length > 2 && points[1].d < s - TAIL) points.shift();

        // Nobody drawing and the train at rest: fade it all away, then start clean.
        if (!drawing && speed < 8) {
          fade = Math.max(0, fade - dt / FADE_S);
          if (fade === 0) { points = []; head = null; s = 0; speed = 0; travelled = 0; }
        }
      }
      draw();
      place();
    };

    resize();
    draw();
    place();
    const sizer = new ResizeObserver(() => { resize(); draw(); place(); });
    sizer.observe(root);
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    watcher.observe(root);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      watcher.disconnect();
    };
  }, [dark, cargoCount]);

  // Pointer position in the card's own pixels, even when the card is drawn scaled.
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = card.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const scale = rect.width / (root.offsetWidth || rect.width || 1);
    pointer.current = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    lastInput.current = performance.now();
  };
  const release = () => { pointer.current = null; lastInput.current = performance.now(); };

  return (
    <div
      ref={card}
      onPointerMove={track}
      onPointerDown={track}
      onPointerLeave={release}
      onPointerCancel={release}
      className={`relative isolate h-full min-h-[28rem] w-full touch-pan-y select-none overflow-hidden rounded-[2rem] ${dark ? "bg-[#111318] text-white" : "bg-white text-neutral-950"} ${className}`}
    >
      <div className="pointer-events-none relative z-0 p-6 sm:p-8">
        <h2 className="whitespace-nowrap text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-3xl">
          {title[0]} <span className={dark ? "text-white/40" : "text-neutral-400"}>{title[1]}</span>
        </h2>
        {description && <p className={`mt-2 max-w-[22rem] text-sm leading-relaxed ${dark ? "text-white/60" : "text-neutral-500"}`}>{description}</p>}
      </div>

      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {CARS.map((car, index) => (
          <div
            key={index}
            ref={(element) => { cars.current[index] = element; }}
            className="absolute left-0 top-0 opacity-0 transition-opacity duration-300"
            style={{ width: car.width, height: car.height, transformOrigin: "0 0" }}
          >
            {index === 0 ? <Engine color={color} /> : <Wagon color={color} cargo={cargo[(index - 1) % Math.max(1, cargoCount)]} />}
          </div>
        ))}
        {puffs.map((puff) => <PuffedIcon key={puff.id} puff={puff} cargo={cargo[puff.cargo]} onDone={removePuff} />)}
      </div>
    </div>
  );
}

export default DrawALine;
