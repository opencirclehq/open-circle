/* Split Footer: a dark brand panel lit by drifting ASCII light beside a white link panel,
   with the wordmark fading up from the bottom. Adapted from the Dailo landing footer.
   Self-contained React + Tailwind: the ASCII light is a small canvas, no WebGL library. */

import * as React from "react";

export type FooterLink = { label: string; href: string };
export type FooterGroup = { title: string; links: FooterLink[] };
export type FooterSocial = { label: string; href: string; icon: "x" | "linkedin" | "github" };

export type SplitFooterProps = {
  brand: string;
  /** Two short lines work best. */
  tagline: [string, string];
  groups: FooterGroup[];
  socials?: FooterSocial[];
  /** Light colours of the ASCII field, darkest to brightest. */
  palette?: [string, string, string];
  /** Panel colour behind the ASCII light. */
  panel?: string;
  /** Accent for group titles and link hover. */
  accent?: string;
  className?: string;
};

const SOCIAL_PATHS: Record<FooterSocial["icon"], React.ReactNode> = {
  x: (
    <>
      <path d="M4 4h4.6L20 20h-4.6L4 4Z" />
      <path d="m19.5 4.5-6.1 6.8M4.5 19.5l6.1-6.8" />
    </>
  ),
  linkedin: (
    <>
      <path d="M2 12c0-4.7 0-7.1 1.5-8.5C4.9 2 7.3 2 12 2s7.1 0 8.5 1.5C22 4.9 22 7.3 22 12s0 7.1-1.5 8.5C19.1 22 16.7 22 12 22s-7.1 0-8.5-1.5C2 19.1 2 16.7 2 12Z" />
      <path d="M7 10.5V17M7 7v.01M11 17v-6.5M11 13.75c0-1.8 1.34-3.25 3-3.25s3 1.45 3 3.25V17" />
    </>
  ),
  github: (
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
};

function SocialIcon({ icon }: { icon: FooterSocial["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {SOCIAL_PATHS[icon]}
    </svg>
  );
}

const CHARS = " .:-=+xX0S8#@";
const CELL = 15;

function mix(a: number[], b: number[], t: number) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function toRgb(color: string): number[] {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}

/** Characters glowing from a horizon at the bottom, drifting slowly. Still for reduced motion. */
function AsciiLight({ palette }: { palette: [string, string, string] }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // Restart only when the colours change, not on every new array.
  const key = palette.join(",");

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const colors = key.split(",").map(toRgb);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = `${CELL - 3}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
    };

    const draw = (time: number) => {
      const t = time / 1000;
      context.clearRect(0, 0, width, height);
      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col / cols;
          const y = row / rows;
          // Brightest along a horizon near the bottom, rippled by two slow waves.
          const horizon = 0.78 + Math.sin(x * 3.1 + t * 0.35) * 0.06;
          const glow = Math.max(0, 1 - Math.abs(y - horizon) * 2.4);
          const ripple = 0.5 + 0.5 * Math.sin(x * 11 + y * 7 - t * 0.9) * Math.cos(y * 5 + t * 0.4);
          const level = Math.min(1, glow * (0.55 + ripple * 0.6));
          if (level < 0.08) continue;
          const tone = level < 0.5 ? mix(colors[0], colors[1], level * 2) : mix(colors[1], colors[2], (level - 0.5) * 2);
          context.fillStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},${0.25 + level * 0.75})`;
          context.fillText(CHARS[Math.min(CHARS.length - 1, Math.floor(level * CHARS.length))], col * CELL + CELL / 2, row * CELL + CELL / 2);
        }
      }
    };

    const loop = (time: number) => {
      if (visible) draw(time);
      frame = requestAnimationFrame(loop);
    };

    resize();
    const sizer = new ResizeObserver(() => { resize(); if (still) draw(0); });
    sizer.observe(canvas);
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    watcher.observe(canvas);
    if (still) draw(0);
    else frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      watcher.disconnect();
    };
  }, [key]);

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />;
}

export function SplitFooter({
  brand,
  tagline,
  groups,
  socials = [],
  palette = ["#1e3a8a", "#60a5fa", "#eff6ff"],
  panel = "#0b1533",
  accent = "#2563eb",
  className = "",
}: SplitFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={`grid gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)] ${className}`}>
      {/* Left: the brand over the ASCII light. */}
      <div className="relative isolate flex min-h-[26rem] flex-col justify-between overflow-hidden rounded-[2rem] p-8 text-white sm:p-10" style={{ background: panel }}>
        <div className="absolute inset-0 -z-10">
          <AsciiLight palette={palette} />
        </div>
        <p className="text-lg font-semibold tracking-tight">{brand}</p>
        <div>
          <p className="text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl">
            {tagline[0]}
            <br />
            {tagline[1]}
          </p>
          {socials.length > 0 && (
            <div className="mt-6 flex gap-2">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                >
                  <SocialIcon icon={social.icon} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: links on white, with the name fading up from the bottom. */}
      <div className="relative isolate flex min-h-[26rem] flex-col overflow-hidden rounded-[2rem] bg-white p-8 sm:p-12" style={{ "--accent": accent } as React.CSSProperties}>
        <nav aria-label="Footer" className="grid gap-10 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-sm font-medium text-[var(--accent)]">{group.title}</p>
              <ul className="mt-5 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="text-lg font-medium tracking-tight text-slate-900 transition-colors hover:text-[var(--accent)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="mt-auto pt-16 text-sm text-slate-900/70">© {year} {brand}. All rights reserved.</p>
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-[0.22em] right-4 -z-10 select-none bg-clip-text text-[clamp(6rem,19vw,15rem)] font-medium leading-none tracking-[-0.06em] text-transparent sm:right-10"
          style={{ backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${accent} 25%, transparent), transparent 85%)` }}
        >
          {brand.toLowerCase()}
        </span>
      </div>
    </footer>
  );
}

export default SplitFooter;
