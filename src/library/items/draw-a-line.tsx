/* Draw a Line: a toy train set on a tilted tabletop. Move across the card to lay
   track; a little train follows it, puffing your app icons out of its chimney.
   They land on the table, bounce and settle. Cross your own track and a bridge
   rises so the train climbs over. In dark mode a headlight lights the way. When
   nobody is drawing, the train finishes its run and the scene fades away.
   Self-contained React + Tailwind: one canvas with a small perspective camera.
   No other packages. */

import * as React from "react";

export type TrainCargo = {
  icon: React.ReactNode;
  /** A colour or a CSS linear-gradient (its colours are used top to bottom). */
  color: string;
  label?: string;
};

export type DrawALineProps = {
  /** Two parts: the second is shown muted, e.g. ["Draw a", "line."]. */
  title?: [string, string];
  description?: string;
  /** Icons the wagons carry and the chimney puffs out. */
  cargo: TrainCargo[];
  /** Train colour, as a hex value. */
  color?: string;
  theme?: "light" | "dark";
  className?: string;
};

type Vec = { x: number; y: number };
type Point = Vec & { d: number; t: number };
type Sample = Vec & { d: number; a: number; e: number; t: number };
type Bridge = { center: number; height: number; born: number };
type Flyer = Vec & { z: number; vx: number; vy: number; vz: number; cargo: number; born: number; settled: number | null };
type Puff = Vec & { z: number; vx: number; vy: number; born: number; life: number };
type Drawable = { key: number; run: () => void };

// Camera: the table tilts back, so depth is foreshortened to TILT near the front edge.
const TILT = 0.5;
const LIFT = 0.9; // how much of an object's height shows on screen
const GRID = 36;

// Track, in table units.
const GAUGE = 6; // half the distance between the rails
const TIE_GAP = 12;
const TIE_HALF = 11;
const DECK = TIE_HALF + 3;
const RAIL = 5; // top of the rails above the track bed
const STEP = 5;
const DROP = 0.3; // seconds a sleeper takes to drop into place
const MAX_TRACK = 2600;

// Bridges: a plateau over the crossing with eased ramps either side.
const PLATEAU = 16;
const RAMP = 70;
const BRIDGE_HEIGHT = 20;
const BRIDGE_RISE = 0.45;

// Train.
const LEAD = 40; // how far the engine stays behind the cursor
const CARS = [
  { kind: "engine", back: 26, length: 48 },
  { kind: "wagon", back: 74, length: 34 },
  { kind: "wagon", back: 114, length: 34 },
] as const;

const IDLE_MS = 1200; // no drawing for this long, with the train at rest: the scene fades
const FADE_S = 0.7;
const MAX_FLYERS = 10;

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Mix a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return `rgb(${[value >> 16, (value >> 8) & 255, value & 255].map((channel) => Math.round(channel + (target - channel) * t)).join(",")})`;
}

/** The colours in a CSS colour or gradient string, for painting cargo tiles. */
function stops(fill: string) {
  return fill.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [fill];
}

function profile(offset: number) {
  const distance = Math.abs(offset);
  if (distance <= PLATEAU) return 1;
  if (distance >= PLATEAU + RAMP) return 0;
  return smoothstep(1 - (distance - PLATEAU) / RAMP);
}

/** Where segments ab and cd cross, as fractions along each, or null. */
function intersect(a: Vec, b: Vec, c: Vec, d: Vec) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < 1e-9) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const u = (qp.x * s.y - qp.y * s.x) / cross;
  const v = (qp.x * r.y - qp.y * r.x) / cross;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}

/** The point at distance `d` along the track, with the time it was laid. */
function at(points: Point[], d: number): Point {
  const last = points.length - 1;
  if (d <= points[0].d) return points[0];
  if (d >= points[last].d) return points[last];
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].d <= d) low = middle;
    else high = middle;
  }
  const a = points[low];
  const b = points[high];
  const t = (d - a.d) / (b.d - a.d || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d, t: a.t + (b.t - a.t) * t };
}

function headingAt(points: Point[], d: number) {
  const ahead = at(points, d + 8);
  const behind = at(points, d - 8);
  return Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
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
  const iconHost = React.useRef<HTMLDivElement>(null);
  const images = React.useRef<(HTMLImageElement | null)[]>([]);
  const cargoRef = React.useRef(cargo);
  const pointer = React.useRef<Vec | null>(null);
  const lastInput = React.useRef(-Infinity);
  const dark = theme === "dark";

  React.useLayoutEffect(() => { cargoRef.current = cargo; });

  // The icons are rendered hidden once, then turned into images the canvas can paint.
  React.useEffect(() => {
    const host = iconHost.current;
    if (!host) return;
    images.current = [...host.children].map((child) => {
      const svg = child.querySelector("svg");
      if (!svg) return null;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", "64");
      clone.setAttribute("height", "64");
      clone.setAttribute("color", "#ffffff");
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
      return image;
    });
  }, [cargo]);

  React.useEffect(() => {
    const root = card.current;
    const surface = canvas.current;
    if (!root || !surface) return;
    const ctx = surface.getContext("2d");
    const grid = document.createElement("canvas");
    const gridCtx = grid.getContext("2d");
    if (!ctx || !gridCtx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const palette = dark
      ? { dot: "#ffffff", dotAlpha: 0.08, tie: "#52525b", tieSide: "#27272a", railBase: "#3f3f46", railTop: "#e4e4e7", deck: "#3f3f46", deckSide: "#1f1f23", pillar: "#2a2a30", shadow: "#000000", shadowAlpha: 0.45, steam: "255,255,255", steel: "#0b0b0d", window: "#ffd36b" }
      : { dot: "#0f172a", dotAlpha: 0.12, tie: "#e7e5e4", tieSide: "#a8a29e", railBase: "#52525b", railTop: "#f4f4f5", deck: "#f5f5f4", deckSide: "#a8a29e", pillar: "#d6d3d1", shadow: "#0f172a", shadowAlpha: 0.14, steam: "148,163,184", steel: "#18181b", window: "rgba(255,255,255,.9)" };

    let points: Point[] = [];
    let bridges: Bridge[] = [];
    let flyers: Flyer[] = [];
    let puffs: Puff[] = [];
    let head: Vec | null = null;
    let fade = 1;
    let s = 0;
    let speed = 0;
    let travelled = 0;
    let steamClock = 0;
    let spin = 0;
    let flyerCount = 0;
    const leans = CARS.map(() => 0);
    let previous = 0;
    let frame = 0;
    let visible = true;
    let width = 0;
    let height = 0;
    let middle = 0;
    let horizon = 0;
    let base = 0;
    let depth = 1;

    const project = (x: number, y: number, z: number) => {
      const scale = 1 / (1 + Math.max(y, -0.4 / depth) * depth);
      return { x: middle + (x - middle) * scale, y: horizon + (base - horizon) * scale - z * scale * LIFT, scale };
    };
    const unproject = (sx: number, sy: number): Vec => {
      const scale = Math.max(0.08, (sy - horizon) / (base - horizon));
      return { x: middle + (sx - middle) / scale, y: (1 / scale - 1) / depth };
    };
    const polygon = (corners: Vec[], style: string | CanvasGradient) => {
      ctx.beginPath();
      corners.forEach((corner, index) => (index ? ctx.lineTo(corner.x, corner.y) : ctx.moveTo(corner.x, corner.y)));
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
    };

    const elevation = (d: number, now: number) => {
      let lift = 0;
      for (const bridge of bridges) {
        const grow = still ? 1 : 1 - Math.pow(1 - Math.min(1, (now - bridge.born) / BRIDGE_RISE), 3);
        lift = Math.max(lift, bridge.height * profile(d - bridge.center) * grow);
      }
      return lift;
    };

    const lay = (x: number, y: number, now: number) => {
      const last = points[points.length - 1];
      if (!last) { points.push({ x, y, d: 0, t: now }); s = 0; return; }
      const step = Math.hypot(x - last.x, y - last.y);
      if (step < 4) return;
      const next = { x, y, d: last.d + step, t: now };
      // Crossing older track raises a bridge for the new track over it.
      for (let index = 0; index < points.length - 1; index++) {
        const a = points[index];
        const b = points[index + 1];
        if (b.d > last.d - 50) break;
        const hit = intersect(a, b, last, next);
        if (!hit) continue;
        const crossing = last.d + hit.v * step;
        if (bridges.some((bridge) => Math.abs(bridge.center - crossing) < PLATEAU + RAMP)) continue;
        const under = elevation(a.d + hit.u * (b.d - a.d), now);
        bridges.push({ center: crossing, height: BRIDGE_HEIGHT + under, born: now });
      }
      points.push(next);
      while (points.length > 2 && points[1].d < next.d - MAX_TRACK) points.shift();
      bridges = bridges.filter((bridge) => bridge.center + PLATEAU + RAMP > points[0].d);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = root.clientWidth;
      height = root.clientHeight;
      for (const target of [surface, grid]) {
        target.width = Math.round(width * ratio);
        target.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      gridCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      middle = width / 2;
      base = height;
      horizon = -height * 1.1;
      depth = TILT / Math.max(1, base - horizon);

      // The tabletop: a dot grid that recedes into the distance.
      gridCtx.clearRect(0, 0, width, height);
      if (!width || !height) return;
      gridCtx.fillStyle = palette.dot;
      const far = unproject(middle, 0).y;
      for (let y = 0; y <= far; y += GRID) {
        const scale = 1 / (1 + y * depth);
        const reach = middle / scale + GRID;
        for (let x = middle - Math.ceil(reach / GRID) * GRID; x <= middle + reach; x += GRID) {
          const dot = project(x, y, 0);
          gridCtx.globalAlpha = palette.dotAlpha * (0.25 + 0.75 * scale);
          gridCtx.beginPath();
          gridCtx.arc(dot.x, dot.y, 0.5 + scale * 0.8, 0, Math.PI * 2);
          gridCtx.fill();
        }
      }
      gridCtx.globalAlpha = 1;
    };

    /* ---------- Track ---------- */

    const railPoint = (sample: Sample, side: number, z: number) =>
      project(sample.x - Math.sin(sample.a) * GAUGE * side, sample.y + Math.cos(sample.a) * GAUGE * side, z);

    const railSpan = (a: Sample, b: Sample, top: boolean) => {
      const lift = top ? RAIL - 0.6 : 2;
      ctx.strokeStyle = top ? palette.railTop : palette.railBase;
      for (const side of [-1, 1]) {
        const from = railPoint(a, side, a.e + lift);
        const to = railPoint(b, side, b.e + lift);
        ctx.lineWidth = (top ? 1.3 : 2.8) * (from.scale + to.scale) / 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    };

    const sleeper = (d: number, now: number) => {
      const p = at(points, d);
      const angle = headingAt(points, d);
      const lift = elevation(d, now);
      const age = still ? 1 : now - p.t;
      if (age <= 0) return;
      const drop = age < DROP ? (1 - easeOutBack(age / DROP)) * 16 : 0;
      const f = { x: Math.cos(angle), y: Math.sin(angle) };
      const n = { x: -f.y, y: f.x };
      const face = (z: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
        project(p.x + f.x * i * 2.2 + n.x * j * TIE_HALF, p.y + f.y * i * 2.2 + n.y * j * TIE_HALF, z));
      ctx.globalAlpha = fade * Math.min(1, age / 0.1);
      polygon(face(lift + drop), palette.tieSide);
      polygon(face(lift + drop + 2), palette.tie);
      ctx.globalAlpha = fade;
    };

    /** A raised stretch of track: pillars, deck, sleepers and rails, drawn together so it sorts as one piece. */
    const bridgePiece = (a: Sample, b: Sample, now: number) => {
      const edge = (sample: Sample, side: number, z: number) =>
        project(sample.x - Math.sin(sample.a) * DECK * side, sample.y + Math.cos(sample.a) * DECK * side, z);
      ctx.globalAlpha = fade;
      for (const bridge of bridges) {
        if (bridge.center < a.d || bridge.center >= b.d || a.e < bridge.height * 0.9) continue;
        ctx.strokeStyle = palette.pillar;
        for (const side of [-1, 1]) {
          const top = edge(a, side * 0.82, a.e - 5);
          const foot = edge(a, side * 0.82, 0);
          ctx.lineWidth = 4.5 * top.scale;
          ctx.beginPath();
          ctx.moveTo(foot.x, foot.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
      }
      for (const side of [-1, 1]) {
        if (Math.cos(a.a) * side >= 0) continue; // only the side facing the viewer shows
        polygon([edge(a, side, a.e), edge(b, side, b.e), edge(b, side, b.e - 5), edge(a, side, a.e - 5)], palette.deckSide);
      }
      polygon([edge(a, -1, a.e), edge(b, -1, b.e), edge(b, 1, b.e), edge(a, 1, a.e)], palette.deck);
      for (let d = Math.ceil(a.d / TIE_GAP) * TIE_GAP; d < b.d; d += TIE_GAP) sleeper(d, now);
      railSpan(a, b, false);
      railSpan(a, b, true);
    };

    /* ---------- Train ---------- */

    /** A shaded box standing on the table: centre, heading, base height, size, and a lean that shears the top sideways. */
    const box = (c: Vec, f: Vec, zb: number, length: number, breadth: number, tall: number, fill: string, lean = 0) => {
      const n = { x: -f.y, y: f.x };
      const corner = (i: number, j: number, top: boolean) => {
        const sway = top ? lean * tall : 0;
        return project(c.x + f.x * i * length / 2 + n.x * (j * breadth / 2 + sway), c.y + f.y * i * length / 2 + n.y * (j * breadth / 2 + sway), zb + (top ? tall : 0));
      };
      const faces: [Vec, [number, number], [number, number]][] = [
        [f, [1, -1], [1, 1]],
        [{ x: -f.x, y: -f.y }, [-1, -1], [-1, 1]],
        [n, [-1, 1], [1, 1]],
        [{ x: -n.x, y: -n.y }, [-1, -1], [1, -1]],
      ];
      for (const [normal, [i0, j0], [i1, j1]] of faces) {
        if (normal.y >= 0) continue; // faces away from the viewer
        polygon([corner(i0, j0, false), corner(i1, j1, false), corner(i1, j1, true), corner(i0, j0, true)], shade(fill, -0.12 - 0.2 * (0.5 + 0.5 * normal.x)));
      }
      polygon([corner(-1, -1, true), corner(1, -1, true), corner(1, 1, true), corner(-1, 1, true)], shade(fill, 0.14));
    };

    /** A circle standing upright in the plane of `axis` and height. */
    const disc = (c: Vec, z: number, axis: Vec, r: number, fill: string) => {
      ctx.beginPath();
      for (let index = 0; index <= 16; index++) {
        const angle = (index / 16) * Math.PI * 2;
        const p = project(c.x + axis.x * r * Math.cos(angle), c.y + axis.y * r * Math.cos(angle), z + r * Math.sin(angle));
        if (index) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const wheels = (c: Vec, f: Vec, rail: number, offsets: number[], halfWidth: number) => {
      const n = { x: -f.y, y: f.x };
      const side = n.y < 0 ? 1 : -1; // the side facing the viewer
      for (const offset of offsets) {
        const hub = { x: c.x + f.x * offset + n.x * halfWidth * side, y: c.y + f.y * offset + n.y * halfWidth * side };
        disc(hub, rail + 4, f, 4.2, palette.steel);
        disc(hub, rail + 4, f, 1.5, "#ffffff");
        const center = project(hub.x, hub.y, rail + 4);
        const rim = project(hub.x + f.x * 3.4 * Math.cos(spin), hub.y + f.y * 3.4 * Math.cos(spin), rail + 4 + 3.4 * Math.sin(spin));
        ctx.strokeStyle = "rgba(255,255,255,.7)";
        ctx.lineWidth = center.scale;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(rim.x, rim.y);
        ctx.stroke();
      }
    };

    const tile = (sx: number, sy: number, size: number, index: number, alpha: number) => {
      const item = cargoRef.current[index];
      if (!item || size < 1) return;
      const x = sx - size / 2;
      const y = sy - size;
      const colours = stops(item.color);
      const gradient = ctx.createLinearGradient(x, y, x, y + size);
      colours.forEach((colour, at) => gradient.addColorStop(colours.length === 1 ? 0 : at / (colours.length - 1), colour));
      const radius = size * 0.28;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + size, y, x + size, y + size, radius);
      ctx.arcTo(x + size, y + size, x, y + size, radius);
      ctx.arcTo(x, y + size, x, y, radius);
      ctx.arcTo(x, y, x + size, y, radius);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      const image = images.current[index];
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, x + size * 0.22, y + size * 0.22, size * 0.56, size * 0.56);
    };

    const engine = (c: Vec, f: Vec, lift: number, lean: number) => {
      const n = { x: -f.y, y: f.x };
      const rail = lift + RAIL;
      const along = (offset: number): Vec => ({ x: c.x + f.x * offset, y: c.y + f.y * offset });
      ctx.globalAlpha = fade;
      box(along(0), f, rail + 5, 46, 16, 3, palette.steel);
      box(along(25), f, rail + 2, 4, 12, 5, palette.steel);
      const cab = () => {
        box(along(-14), f, rail + 8, 14, 15, 19, color, lean);
        const side = n.y < 0 ? 1 : -1;
        const pane = (offset: number, z: number) => project(c.x + f.x * offset + n.x * 7.7 * side + n.x * lean * 12, c.y + f.y * offset + n.y * 7.7 * side + n.y * lean * 12, rail + z);
        polygon([pane(-18, 17), pane(-10, 17), pane(-10, 23), pane(-18, 23)], palette.window);
        box(along(-14), f, rail + 27, 17, 17, 2.5, palette.steel, lean);
      };
      const boiler = () => {
        box(along(8), f, rail + 8, 26, 13, 12, color, lean);
        box(along(14), f, rail + 20, 5, 5, 9, palette.steel, lean);
        if (f.y < -0.05) {
          // The face looks out of the boiler's front when it's heading toward you.
          const front = along(21.4);
          disc(front, rail + 14, n, 5.4, "#ffffff");
          for (const eye of [-2.1, 2.1]) disc({ x: front.x + n.x * eye, y: front.y + n.y * eye }, rail + 15.2, n, 1.1, "#111111");
          if (dark) disc(front, rail + 21.5, n, 1.8, "#fff1c2");
        }
      };
      // Draw whichever part is farther from the viewer first.
      const parts = [{ y: along(-14).y, run: cab }, { y: along(8).y, run: boiler }].sort((a, b) => b.y - a.y);
      parts.forEach((part) => part.run());
      wheels(c, f, rail, [-15, -3, 10], 8.5);
    };

    const wagon = (c: Vec, f: Vec, lift: number, lean: number, load: number) => {
      const n = { x: -f.y, y: f.x };
      const rail = lift + RAIL;
      ctx.globalAlpha = fade;
      box(c, f, rail + 5, 32, 15, 3, palette.steel);
      box(c, f, rail + 8, 28, 14, 9, color, lean);
      wheels(c, f, rail, [-9, 9], 8);
      const top = project(c.x + n.x * lean * 9, c.y + n.y * lean * 9, rail + 17);
      tile(top.x, top.y + 2 * top.scale, 15 * top.scale, load, fade);
      ctx.globalAlpha = fade;
    };

    const headlight = (c: Vec, f: Vec) => {
      const n = { x: -f.y, y: f.x };
      const apex = { x: c.x + f.x * 24, y: c.y + f.y * 24 };
      const reach = (side: number) => project(apex.x + f.x * 170 + n.x * 62 * side, apex.y + f.y * 170 + n.y * 62 * side, 0);
      const start = project(apex.x, apex.y, 0);
      const end = project(apex.x + f.x * 170, apex.y + f.y * 170, 0);
      const beam = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      beam.addColorStop(0, "rgba(255,236,170,.32)");
      beam.addColorStop(1, "rgba(255,236,170,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade;
      polygon([start, reach(-1), reach(1)], beam);
      ctx.globalCompositeOperation = "source-over";
    };

    /* ---------- Frame ---------- */

    const render = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(grid, 0, 0, width, height);
      ctx.lineCap = "round";
      const drawables: Drawable[] = [];

      if (points.length > 1) {
        const first = points[0].d;
        const end = points[points.length - 1].d;
        // Rails follow a moment behind the sleepers.
        let railEnd = first;
        for (let index = points.length - 1; index >= 0; index--) {
          if (still || now - points[index].t >= 0.08) { railEnd = points[index].d; break; }
        }
        const samples: Sample[] = [];
        for (let d = first; ; d += STEP) {
          const at_ = Math.min(d, railEnd);
          const p = at(points, at_);
          samples.push({ x: p.x, y: p.y, d: at_, t: p.t, a: headingAt(points, at_), e: elevation(at_, now) });
          if (at_ >= railEnd) break;
        }

        // Shadows of raised track fall on the table.
        ctx.globalAlpha = fade * palette.shadowAlpha * 0.8;
        ctx.strokeStyle = palette.shadow;
        for (let index = 1; index < samples.length; index++) {
          const a = samples[index - 1];
          const b = samples[index];
          if (Math.max(a.e, b.e) < 0.5) continue;
          const from = project(a.x + a.e * 0.3, a.y + a.e * 0.15, 0);
          const to = project(b.x + b.e * 0.3, b.y + b.e * 0.15, 0);
          ctx.lineWidth = (DECK * 2 + 4) * from.scale;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }

        // Track on the table, then rails: bases first so the bright tops stay continuous.
        ctx.globalAlpha = fade;
        for (let d = Math.ceil(first / TIE_GAP) * TIE_GAP; d <= end; d += TIE_GAP) {
          if (elevation(d, now) < 0.5) sleeper(d, now);
        }
        for (const top of [false, true]) {
          for (let index = 1; index < samples.length; index++) {
            if (Math.max(samples[index - 1].e, samples[index].e) < 0.5) railSpan(samples[index - 1], samples[index], top);
          }
        }
        for (let index = 1; index < samples.length; index++) {
          const a = samples[index - 1];
          const b = samples[index];
          if (Math.max(a.e, b.e) < 0.5) continue;
          drawables.push({ key: -(a.y + b.y) / 2 + Math.max(a.e, b.e) * 1.2, run: () => bridgePiece(a, b, now) });
        }

        // The train: shadows on the table now, bodies sorted with everything else.
        CARS.forEach((car, index) => {
          const d = s - car.back;
          if (d - car.length / 2 < first) return;
          const p = at(points, d);
          const angle = headingAt(points, d);
          const f = { x: Math.cos(angle), y: Math.sin(angle) };
          const n = { x: -f.y, y: f.x };
          const lift = elevation(d, now);
          const footprint = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
            project(p.x + f.x * i * (car.length / 2 + 2) + n.x * j * 9 + lift * 0.3, p.y + f.y * i * (car.length / 2 + 2) + n.y * j * 9 + lift * 0.15, 0));
          ctx.globalAlpha = fade * palette.shadowAlpha;
          polygon(footprint, palette.shadow);
          if (index === 0 && dark) headlight(p, f);
          const lean = leans[index];
          drawables.push({
            key: -p.y + lift * 1.2 + 0.5,
            run: () => (car.kind === "engine" ? engine(p, f, lift, lean) : wagon(p, f, lift, lean, (index - 1) % Math.max(1, cargoRef.current.length))),
          });
        });
      }

      // Icons that were puffed out: a shadow on the table, the tile above it.
      for (const flyer of flyers) {
        const alpha = Math.min(1, (now - flyer.born) / 0.15) * 0.8 * (flyer.settled === null ? 1 : 1 - clamp((now - flyer.settled - 0.8) / 0.7, 0, 1));
        const ground = project(flyer.x, flyer.y, 0);
        const radius = 11 * ground.scale * (1 - Math.min(0.6, flyer.z / 220));
        ctx.globalAlpha = alpha * palette.shadowAlpha * 1.4;
        ctx.fillStyle = palette.shadow;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y, radius, radius * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        drawables.push({ key: -flyer.y + flyer.z * 0.2 + 2, run: () => { const p = project(flyer.x, flyer.y, flyer.z); tile(p.x, p.y, 26 * p.scale, flyer.cargo, alpha); } });
      }
      for (const puff of puffs) {
        const age = (now - puff.born) / puff.life;
        drawables.push({
          key: -puff.y + puff.z * 1.2 + 3,
          run: () => {
            const p = project(puff.x, puff.y, puff.z);
            ctx.globalAlpha = 0.42 * (1 - age);
            ctx.fillStyle = `rgb(${palette.steam})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, (3 + age * 10) * p.scale, 0, Math.PI * 2);
            ctx.fill();
          },
        });
      }

      drawables.sort((a, b) => a.key - b.key).forEach((item) => item.run());
      ctx.globalAlpha = 1;
    };

    const step = (time: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(0.05, previous ? (time - previous) / 1000 : 0);
      previous = time;
      if (!visible || document.hidden || width === 0) return;
      const now = time / 1000;

      // The head of the track eases after the cursor, so quick flicks still lay smooth curves.
      const drawing = performance.now() - lastInput.current <= IDLE_MS;
      if (pointer.current) {
        if (drawing) fade = 1;
        const target = unproject(pointer.current.x, pointer.current.y);
        const from = head ?? target;
        const ease = 1 - Math.exp(-dt * 18);
        head = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease };
        lay(head.x, head.y, now);
      }

      if (points.length > 1) {
        const goal = Math.max(0, points[points.length - 1].d - LEAD);
        const wanted = Math.min(520, Math.max(0, (goal - s) * 2.6));
        speed += (wanted - speed) * (1 - Math.exp(-dt * 4));
        s = Math.min(goal, s + speed * dt);
        spin += (speed * dt) / 4.2;
        travelled += speed * dt;

        // Cars lean out of curves in proportion to speed.
        CARS.forEach((car, index) => {
          const d = s - car.back;
          let turn = headingAt(points, d + 12) - headingAt(points, d - 12);
          turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / 24;
          const target = still ? 0 : clamp(-turn * speed * 0.04, -0.22, 0.22);
          leans[index] += (target - leans[index]) * (1 - Math.exp(-dt * 8));
        });

        if (!still && speed > 25) {
          const d = s - CARS[0].back;
          const p = at(points, d);
          const angle = headingAt(points, d);
          const f = { x: Math.cos(angle), y: Math.sin(angle) };
          const n = { x: -f.y, y: f.x };
          const chimney = { x: p.x + f.x * 14, y: p.y + f.y * 14, z: elevation(d, now) + RAIL + 30 };
          steamClock += dt;
          if (steamClock > 0.09) {
            steamClock = 0;
            puffs.push({ ...chimney, vx: -f.x * 10 + (Math.random() - 0.5) * 8, vy: -f.y * 10 + (Math.random() - 0.5) * 8, born: now, life: 1.1 });
          }
          if (travelled > 170 && speed > 60 && cargoRef.current.length) {
            travelled = 0;
            const side = Math.random() < 0.5 ? -1 : 1;
            const out = 55 + Math.random() * 45;
            flyers = [...flyers.slice(-(MAX_FLYERS - 1)), {
              ...chimney,
              vx: n.x * side * out + f.x * (Math.random() - 0.5) * 40,
              vy: n.y * side * out + f.y * (Math.random() - 0.5) * 40,
              vz: 170 + Math.random() * 60,
              cargo: flyerCount++ % cargoRef.current.length,
              born: now,
              settled: null,
            }];
            for (let index = 0; index < 4; index++) {
              puffs.push({ ...chimney, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, born: now, life: 0.9 });
            }
          }
        }

        // Nobody drawing and the train at rest: fade the scene away, then start clean.
        if (!drawing && speed < 8) {
          fade = Math.max(0, fade - dt / FADE_S);
          if (fade === 0) { points = []; bridges = []; head = null; s = 0; speed = 0; travelled = 0; }
        }
      }

      // Icons fall, bounce on the table and settle; steam drifts up and thins out.
      for (const flyer of flyers) {
        if (flyer.settled !== null) continue;
        flyer.vz -= 560 * dt;
        flyer.x += flyer.vx * dt;
        flyer.y += flyer.vy * dt;
        flyer.z += flyer.vz * dt;
        if (flyer.z <= 0) {
          flyer.z = 0;
          if (Math.abs(flyer.vz) < 70) { flyer.vz = 0; flyer.vx = 0; flyer.vy = 0; flyer.settled = now; }
          else { flyer.vz = -flyer.vz * 0.4; flyer.vx *= 0.55; flyer.vy *= 0.55; }
        }
      }
      flyers = flyers.filter((flyer) => (flyer.settled === null ? now - flyer.born < 5 : now - flyer.settled < 1.5));
      for (const puff of puffs) {
        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
        puff.z += 26 * dt;
      }
      puffs = puffs.filter((puff) => now - puff.born < puff.life);

      render(now);
    };

    resize();
    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    watcher.observe(root);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      watcher.disconnect();
    };
  }, [dark, color]);

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
      {/* The cargo icons, rendered once so the canvas can paint them. */}
      <div ref={iconHost} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 -z-10 size-0 overflow-hidden">
        {cargo.map((item, index) => <span key={index}>{item.icon}</span>)}
      </div>
    </div>
  );
}

export default DrawALine;
