import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders children at a fixed design width and scales them down to fit, so a
 * full-width component keeps its real layout in a smaller frame.
 *
 * - `height`: a fixed design height too (a whole screen, like a hero); the frame takes its scaled height.
 * - `fill`: the content gets the frame's own (scaled) height to fill. Default for non-interactive previews.
 * - otherwise the frame takes the scaled height of the content.
 * - `interactive`: stays usable; without it the preview is purely visual (inert, ignores the pointer).
 */
export function ScaledPreview({ width, height: designHeight, children, className, interactive = false, fill = !interactive }: {
  width: number;
  height?: number;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  fill?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [frameHeight, setFrameHeight] = useState<number | undefined>(undefined);
  const sized = Boolean(designHeight) || !fill;

  useLayoutEffect(() => {
    const element = frame.current;
    const inner = content.current;
    if (!element || !inner) return;
    const update = () => {
      const next = Math.min(1, element.clientWidth / width);
      if (next <= 0) return;
      setScale(next);
      if (designHeight) setHeight(designHeight * next);
      else if (fill) setFrameHeight(element.clientHeight / next);
      else setHeight(inner.offsetHeight * next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width, designHeight, fill]);

  return (
    <div
      ref={frame}
      className={`relative overflow-hidden ${interactive ? "" : "pointer-events-none"} ${className ?? ""}`}
      style={sized ? { height } : undefined}
      {...(interactive ? {} : { "aria-hidden": true, inert: true })}
    >
      <div ref={content} className="absolute left-0 top-0 origin-top-left" style={{ width, height: designHeight ?? (fill ? frameHeight : undefined), transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
