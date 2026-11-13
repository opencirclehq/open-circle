import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MetalText } from "@/components/metal-text";
import { motion, useSpring, useTransform } from "motion/react";
import { ChatRoundDotsIcon, CupStarIcon, UserIdIcon, UsersGroupRoundedIcon, Widget4Icon } from "@solar-icons/react/bold-duotone";
import { WhatsAppIcon } from "@/components/brand-icons";
import { toast } from "sonner";
import { BRAND_NAME, DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "@shared/brand";
import type { InviteConfig } from "@shared/types";
import { LiquidGlass } from "@/components/liquid-glass";
import { guardedLeave } from "@/lib/leave-guard";
import { useTheme } from "@/hooks/use-theme";

const BRAND_FONT = "650 15px/1 Aspekta, ui-sans-serif, system-ui, sans-serif";
const SLOT = 44;
const PEAK_SCALE = 1.5;

/**
 * A dock icon that swells while hovered, with a label above it. Only the
 * glyph scales (a transform), so the dock never resizes and neighbours stay put.
 */
function DockIcon({
  label,
  children,
  onClick,
  href,
  active = false,
  edge = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  /** The right-most icon: anchor its label to the right so it stays on screen. */
  edge?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const scale = useSpring(1, { stiffness: 400, damping: 28, mass: 0.2 });
  useEffect(() => scale.set(hovered ? PEAK_SCALE : 1), [hovered, scale]);
  // Rise as it grows so the glyph swells upward, out of the dock.
  const y = useTransform(scale, (s) => -(s - 1) * 14);

  const inner = (
    <>
      <motion.span className="flex size-5 origin-bottom items-center justify-center" style={{ scale, y }}>
        {children}
      </motion.span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute -top-12 whitespace-nowrap ${edge ? "right-0" : "left-1/2 -translate-x-1/2"} rounded-full bg-alva-surface px-2.5 py-1 text-xs font-medium text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100`}
      >
        {label}
      </span>
      {active && <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground" aria-hidden />}
    </>
  );
  const props = {
    "aria-label": label,
    "aria-current": active ? ("page" as const) : undefined,
    className:
      `group relative flex shrink-0 items-center justify-center rounded-full transition-colors hover:text-foreground ${active ? "text-foreground" : "text-t2"}`,
    style: { width: SLOT, height: SLOT },
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setHovered(true),
    onPointerLeave: () => setHovered(false),
  };

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {inner}
    </button>
  );
}

/** Floating liquid-glass dock in place of a header: metal brand name, then icon actions. */
export function Dock({
  invite,
  onRank,
}: {
  invite?: InviteConfig;
  /** Home scrolls to the input in place; elsewhere the dock navigates there. */
  onRank?: () => void;
}) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { pathname } = useLocation();
  // Every route change goes through the leave guard (unsaved portfolio edits).
  const go = (path: string, then?: () => void) => guardedLeave(() => { navigate(path); then?.(); });
  const rank = onRank ?? (() => go("/", () => window.setTimeout(() => document.getElementById("github-input")?.focus(), 400)));
  const onBoard = ["/", "/repositories", "/tools", "/how-it-works"].includes(pathname);
  const inv = invite ?? { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-40 flex justify-center overflow-x-clip pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
      {/* The name sits in its own pill, butted up against the icon dock. */}
      <div className="flex max-w-full items-center gap-1">
        <LiquidGlass radius={9999} className="hidden items-center p-1.5 min-[400px]:flex">
          <button
            type="button"
            onClick={rank}
            className="flex h-11 items-center self-center rounded-full px-1 sm:px-4"
            aria-label={`${BRAND_NAME}, back to top`}
          >
            <MetalText font={BRAND_FONT} color={resolvedTheme === "dark" ? "#F4F7FB" : "#252E3D"} theme={resolvedTheme}>{BRAND_NAME}</MetalText>
          </button>
        </LiquidGlass>
        <LiquidGlass
          radius={9999}
          className="flex items-center gap-0 overflow-visible p-1 sm:gap-1 sm:p-1.5"
        >
          <DockIcon label="Rank me" onClick={rank} active={onBoard}>
            <CupStarIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon label="Community" onClick={() => go("/community")} active={pathname.startsWith("/community") || pathname.startsWith("/events")}>
            <ChatRoundDotsIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon label="Group participation" onClick={() => go("/participation")} active={pathname === "/participation"}>
            <UsersGroupRoundedIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon label="Portfolio" onClick={() => go("/portfolio")} active={pathname === "/portfolio"}>
            <UserIdIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon label="Components" onClick={() => go("/components")} active={pathname.startsWith("/components")}>
            <Widget4Icon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon
            edge
            label="Join the WhatsApp group"
            href={inv.open ? inv.url : undefined}
            onClick={inv.open ? undefined : () => toast(inv.note || DEFAULT_INVITE_NOTE)}
          >
            <WhatsAppIcon className="size-full" />
          </DockIcon>
        </LiquidGlass>
      </div>
    </nav>
  );
}
