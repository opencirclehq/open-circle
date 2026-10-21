import { useId } from "react";

export function BrandMark({ className }: { className?: string }) {
  // Unique per copy, since a page can show the mark more than once.
  const gradient = `brand-bar-${useId()}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <rect x="10" y="30" width="13" height="24" rx="3" fill={`url(#${gradient})`} opacity=".7" />
      <rect x="25.5" y="12" width="13" height="42" rx="3" fill={`url(#${gradient})`} />
      <rect x="41" y="38" width="13" height="16" rx="3" fill={`url(#${gradient})`} opacity=".5" />
    </svg>
  );
}
