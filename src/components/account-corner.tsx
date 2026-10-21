import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BRAND_NAME } from "@shared/brand";
import { GitHubAccount } from "@/components/github-account";
import { MetalText } from "@/components/metal-text";
import { BrandMark } from "@/components/site-header";
import { ThemeSelect } from "@/components/theme-select";
import { useTheme } from "@/hooks/use-theme";
import { guardedLeave } from "@/lib/leave-guard";

const BRAND_FONT = "650 15px/1 Aspekta, ui-sans-serif, system-ui, sans-serif";

/** The logo and name, linking home through the unsaved-work guard like the dock. */
function BrandHome() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const home = (event: MouseEvent<HTMLAnchorElement>) => {
    // New-tab and similar clicks keep the browser's own handling.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    guardedLeave(() => navigate("/"));
  };
  // On phones the page title sits in this row, and the dock carries the name.
  return <Link to="/" onClick={home} aria-label={`${BRAND_NAME} home`} className="hidden min-h-11 shrink-0 items-center gap-2 rounded-full pr-2 sm:flex">
    <BrandMark className="size-7 shrink-0" />
    <MetalText font={BRAND_FONT} color={resolvedTheme === "dark" ? "#F4F7FB" : "#252E3D"} theme={resolvedTheme}>{BRAND_NAME}</MetalText>
  </Link>;
}

/**
 * The brand top-left and the account control top-right, the same on every
 * page. Pass children to replace the account control (admin shows its own
 * session); passing nothing shows the GitHub account menu.
 */
export function AccountCorner(props: { children?: ReactNode }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-30 flex items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:top-[calc(1.5rem+env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] [&>*]:pointer-events-auto">
      <BrandHome />
      <div className="ml-auto flex items-center gap-2">
        {"children" in props ? props.children : <GitHubAccount />}
        <ThemeSelect />
      </div>
    </header>
  );
}
