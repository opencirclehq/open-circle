import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders children at a fixed design width and scales them down to fit the
 * card, so a full-width component reads as a thumbnail. Purely visual: not
 * focusable and ignores the pointer.
 */
export function ScaledPreview({ width, children, className }: { width: number; children: ReactNode; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={frame} className={`pointer-events-none relative overflow-hidden ${className ?? ""}`} aria-hidden inert>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
