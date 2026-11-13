import { useEffect, useRef, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { UserIdIcon } from "@solar-icons/react/linear";
import { useIsMutating } from "@tanstack/react-query";
import { Logout2Icon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { GitHubIcon } from "@/components/brand-icons";
import { MetalButton } from "@/components/metal-button";
import { AccountSkeleton } from "@/components/site-skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { REPOSITORY_STAR_KEY } from "@/hooks/use-repository-stars";
import { TOOL_VOTE_KEY, useCommunity, useGitHubSignOut } from "@/hooks/use-community";

// Shown expanded once, the first time a signed-in member sees it.
const SEEN_KEY = "opencircle:account-menu-seen";
const ITEM = "flex min-h-10 w-full items-center gap-2.5 rounded-full px-3.5 text-left text-sm text-t2 transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:bg-foreground/[0.07] focus-visible:text-foreground disabled:opacity-50";

function seen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* a fresh tab will just show it again */ }
}

/** Portfolio link that works with or without a router around it. */
function PortfolioItem({ onSelect }: { onSelect: () => void }) {
  const routed = useInRouterContext();
  const content = <><UserIdIcon className="size-4" aria-hidden="true" />Portfolio</>;
  return routed
    ? <Link role="menuitem" to="/portfolio" className={ITEM} onClick={onSelect}>{content}</Link>
    : <a role="menuitem" href="/portfolio" className={ITEM} onClick={onSelect}>{content}</a>;
}

/**
 * Avatar that opens a small menu with Portfolio and Log out. Signed out, it's
 * a single round metal GitHub button.
 */
export function GitHubAccount() {
  const community = useCommunity();
  const signOut = useGitHubSignOut();
  const starring = useIsMutating({ mutationKey: REPOSITORY_STAR_KEY }) > 0;
  const voting = useIsMutating({ mutationKey: TOOL_VOTE_KEY }) > 0;
  const profile = community.data?.profile;
  const forumReturn = typeof window !== "undefined" && window.location.pathname.startsWith("/community") ? `?${new URLSearchParams({ returnTo: `${window.location.pathname}${window.location.search}` })}` : "";
  const signInError = new URLSearchParams(window.location.search).has("signin");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (signInError && !profile) toast.error("GitHub sign-in didn't finish. Please try again.");
  }, [signInError, profile]);

  useEffect(() => {
    if (signOut.error) toast.error("Couldn't sign out. Please try again.");
  }, [signOut.error]);

  // Open it the first time a signed-in member lands here, so they find it.
  useEffect(() => {
    if (profile && !seen()) setOpen(true);
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); markSeen(); };
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (community.isPending) return <AccountSkeleton />;

  if (!profile) {
    const available = community.data?.signInAvailable;
    return (
      <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {available ? (
            <MetalButton asChild variant="icon" size="icon" className="size-10" innerClassName="p-0">
              <a href={`/api/auth-start${forumReturn}`} aria-label="Sign in to vote"><GitHubIcon className="size-[18px]" /></a>
            </MetalButton>
          ) : (
            <span className="inline-flex" tabIndex={0}>
              <MetalButton variant="icon" size="icon" className="size-10" innerClassName="p-0" aria-label="Sign in to vote" disabled>
                <GitHubIcon className="size-[18px]" />
              </MetalButton>
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{available ? "Sign in with GitHub to vote" : "GitHub sign-in is being set up."}</TooltipContent>
      </Tooltip>
      </TooltipProvider>
    );
  }

  const close = () => { setOpen(false); markSeen(); };

  return (
    <div ref={root} role="group" aria-label="GitHub account" className="relative">
      <button
        type="button"
        aria-label={`Account menu for @${profile.login}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="touch-target inline-flex size-11 items-center justify-center rounded-full p-0.5 transition-transform hover:scale-[1.04] active:scale-95 sm:size-10"
      >
        <img src={profile.avatarUrl} alt="" className="size-9 rounded-full" width={36} height={36} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 460, damping: 34 }}
            className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-[24px] bg-[hsl(var(--alva-card)/0.94)] p-1.5 backdrop-blur-xl"
          >
            <p className="truncate px-3.5 pb-1.5 pt-2 text-xs text-t4" title={`@${profile.login}`}>@{profile.login}</p>
            <PortfolioItem onSelect={close} />
            <button
              type="button"
              role="menuitem"
              aria-label="Sign out of GitHub"
              className={ITEM}
              disabled={signOut.isPending || voting || starring}
              onClick={() => signOut.mutate(undefined, { onSuccess: close })}
            >
              <Logout2Icon className="size-4" aria-hidden="true" />Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
