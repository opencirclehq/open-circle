import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders children at a fixed design width and scales them down to fit, so a
 * full-width component keeps its real layout in a smaller frame. As a card
 * thumbnail it's purely visual and the content gets the frame's full (scaled)
 * height to fill; with `interactive` it stays usable and the frame takes the
 * scaled height of its content.
 */
export function ScaledPreview({ width, children, className, interactive = false }: { width: number; children: ReactNode; className?: string; interactive?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [frameHeight, setFrameHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = frame.current;
    const inner = content.current;
    if (!element || !inner) return;
    const update = () => {
      const next = Math.min(1, element.clientWidth / width);
      if (next <= 0) return;
      setScale(next);
      if (interactive) setHeight(inner.offsetHeight * next);
      else setFrameHeight(element.clientHeight / next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width, interactive]);

  return (
    <div
      ref={frame}
      className={`relative overflow-hidden ${interactive ? "" : "pointer-events-none"} ${className ?? ""}`}
      style={interactive ? { height } : undefined}
      {...(interactive ? {} : { "aria-hidden": true, inert: true })}
    >
      <div ref={content} className="absolute left-0 top-0 origin-top-left" style={{ width, height: interactive ? undefined : frameHeight, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
