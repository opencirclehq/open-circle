import * as React from "react";
import { MetalText } from "@/components/metal-text";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { FolderWithFilesIcon, RefreshIcon, UsersGroupRoundedIcon } from "@solar-icons/react/bold-duotone";
import { GitPullRequestIcon } from "@solar-icons/react/linear";
import type { PublicMember, PublicRepository } from "@shared/types";
import { SPOTLIGHT_MIN_STARS } from "@shared/spotlight";
import { parseRankingPeriod, RANKING_PERIODS, type RankingPeriod } from "@shared/coordination";
import { Pagination } from "@/components/pagination";
import { PAGE_SIZE, usePagination } from "@/hooks/use-pagination";
import { HowItWorks } from "@/components/board/how-it-works";
import {
  LeaderboardPodium,
  type LeaderboardEntry,
} from "@/components/board/leaderboard-podium";
import { RankMe } from "@/components/board/rank-me";
import { RankTable } from "@/components/board/rank-table";
import { RepositoryExplorer } from "@/components/board/repository-explorer";
import { ToolsDirectory } from "@/components/board/tools-directory";
import { GitHubAccount } from "@/components/github-account";
import { GitHubCommunityLinks } from "@/components/github-community-links";
import { ThemeSelect } from "@/components/theme-select";
import { useTheme } from "@/hooks/use-theme";
import { SiteFooter } from "@/components/site-footer";
import { Dock } from "@/components/dock";
import { BoardSkeleton } from "@/components/site-skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBoard } from "@/hooks/use-board";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { pageFor } from "@shared/seo";
import { formatCount, formatFull, githubUrl, rankingPeriodLabels, timeAgo } from "@/lib/format";
import { readMe } from "@/lib/identity";
import { cn } from "@/lib/utils";

function toEntry(m: PublicMember, period: RankingPeriod): LeaderboardEntry {
  const id = m.login.toLowerCase();
  return {
    id,
    period,
    name: m.nickname,
    points: m.score,
    handle: m.login,
    stars: m.stars,
    activity: m.activity,
    upvotes: m.upvotes,
    helpfulContributions: m.helpfulContributions ?? 0,
    starHelps: m.starHelps ?? 0,
    helpedMembers: m.helpedMembers ?? 0,
    currentStreak: m.currentStreak ?? 0,
    href: githubUrl(m.login),
    avatarUrl: m.avatarUrl || undefined,
    seed: id,
  };
}

function repoEntry(r: PublicRepository): LeaderboardEntry {
  return {
    id: r.id,
    name: r.name,
    points: r.stars,
    handle: r.ownerLogin,
    stars: r.stars,
    href: r.url,
    avatarUrl: r.ownerAvatarUrl || undefined,
    seed: r.ownerLogin.toLowerCase(),
    secondary: { icon: <GitPullRequestIcon size={11} aria-hidden />, value: r.forks, label: "forks" },
  };
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground/[0.06] text-t3">{icon}</span>
      <p className="mt-3 text-sm font-medium text-t2">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-t4">{body}</p>
    </div>
  );
}

/** The active tab's background; slides between triggers via a shared layoutId. */
function TabPill() {
  return (
    <motion.span
      layoutId="board-tab-pill"
      className="absolute inset-0 rounded-full bg-foreground/[0.1]"
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
    />
  );
}

function TabCount({ count }: { count: number }) {
  return <span className="relative text-[10px] leading-4 tabular text-t3 min-[480px]:ml-2 min-[480px]:text-xs" title={formatFull(count)}>
    <span className="min-[480px]:hidden" aria-hidden="true">{formatCount(count)}</span>
    <span className="hidden min-[480px]:inline" aria-hidden="true">{formatFull(count)}</span>
    <span className="sr-only">{formatFull(count)}</span>
  </span>;
}

/** Fades and lifts a tab's content in as it becomes active. */
const TabPanel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof motion.div>>(
  (props, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
      {...props}
    />
  ),
);
TabPanel.displayName = "TabPanel";

const Index = () => {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  usePageMeta();
  const page = pageFor(location.pathname);
  const howItWorks = useMatch("/how-it-works") !== null;
  const repositoriesOpen =
    useMatch("/repositories") !== null ||
    new URLSearchParams(location.search).get("tab") === "repositories";
  const toolsOpen =
    useMatch("/tools") !== null ||
    new URLSearchParams(location.search).get("tab") === "tools";
  const activeTab = toolsOpen ? "tools" : repositoriesOpen ? "repositories" : "developers";
  const period = parseRankingPeriod(new URLSearchParams(location.search).get("period"));
  const periodSearch = period === "all" ? "" : `?period=${period}`;
  const navigationTarget = useRef(location.pathname + location.search);
  useEffect(() => { navigationTarget.current = location.pathname + location.search; }, [location.pathname, location.search]);
  const selectPage = (target: string) => {
    if (navigationTarget.current === target) return;
    navigationTarget.current = target;
    navigate(target);
  };
  const { data: board, isPending, isError, refetch, isRefetching } = useBoard();
  const { data: community } = useCommunity();
  const [me, setMe] = useState<string | null>(readMe);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [locateRequest, setLocateRequest] = useState<{ id: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const flashTimer = useRef<number | undefined>(undefined);

  const members = useMemo(() => (period === "all" ? board?.members : board?.periods?.[period]) ?? [], [board, period]);
  const periodUnavailable = Boolean(board && period !== "all" && !board.periods?.[period]);
  const registeredMember = board?.members.find((member) => member.login.toLowerCase() === me);
  const currentMember = members.find((member) => member.login.toLowerCase() === me);
  const podium = useMemo(() => members.slice(0, 3).map((member) => toEntry(member, period)), [members, period]);
  const rest = useMemo(() => members.slice(3), [members]);
  const [sortBy, setSortBy] = useState<"rank" | "streak">("rank");
  const rankedRest = useMemo(
    () => sortBy === "streak"
      ? [...rest].sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0) || a.rank - b.rank)
      : rest,
    [rest, sortBy],
  );
  const pagination = usePagination(rankedRest, PAGE_SIZE, JSON.stringify([period, sortBy]));
  const setMemberPage = pagination.setPage;
  const repositories = useMemo(() => (board?.repositories ?? []).filter((repo) => repo.stars >= SPOTLIGHT_MIN_STARS), [board]);
  const repoPodium = useMemo(() => repositories.slice(0, 3).map(repoEntry), [repositories]);
  const toolCount = community?.tools.length ?? 0;

  // Visiting /how-it-works opens the explainer over the board.
  const setHowOpen = (open: boolean) =>
    navigate(
      open
        ? `/how-it-works${activeTab !== "developers" || period !== "all" ? `?${new URLSearchParams({ ...(activeTab !== "developers" ? { tab: activeTab } : {}), ...(period !== "all" ? { period } : {}) })}` : ""}`
        : `${activeTab === "developers" ? "/" : `/${activeTab}`}${periodSearch}`,
      { replace: !open },
    );

  const locate = useCallback(
    (login: string) => {
      const id = login.toLowerCase();
      navigate("/", { replace: true });
      setLocateRequest({ id });
      window.clearTimeout(flashTimer.current);
      setFlashId(null);
    },
    [navigate],
  );

  useEffect(() => {
    if (!locateRequest || !members.some((member) => member.login.toLowerCase() === locateRequest.id)) return;
    const { id } = locateRequest;
    const index = rankedRest.findIndex((member) => member.login.toLowerCase() === id);
    setMemberPage(index < 0 ? 1 : Math.floor(index / PAGE_SIZE) + 1);
    setLocateRequest(null);
    flashTimer.current = window.setTimeout(() => {
      setFlashId(id);
      document.getElementById(`member-${id}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1700);
    }, 450);
  }, [locateRequest, members, rankedRest, setMemberPage]);

  useEffect(() => {
    if (location.pathname !== "/") return;
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "repositories" || tab === "tools") navigate(`/${tab}${periodSearch}`, { replace: true });
  }, [location.pathname, location.search, navigate, periodSearch]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />

      <div className="relative z-10">
        <header className="relative z-20 flex items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(1rem+env(safe-area-inset-top))] sm:gap-3 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[calc(1.5rem+env(safe-area-inset-top))]">
          <GitHubCommunityLinks />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2"><GitHubAccount /><ThemeSelect /></div>
        </header>

        <main className="page-container pb-6">
          <section
            className="flex flex-col items-center pt-6 text-center sm:pt-12"
            aria-labelledby="pitch"
          >
            <span className="surface-quiet inline-flex items-center rounded-full px-3.5 py-1.5">
              <MetalText font="500 12px/1 Aspekta, ui-sans-serif, system-ui, sans-serif" color={resolvedTheme === "dark" ? "#E2E2E2" : "#252E3D"} theme={resolvedTheme}>
                Open Source Circle
              </MetalText>
            </span>
            <h1
              id="pitch"
              className="text-gradient mt-3 max-w-full text-balance text-[30px] font-[350] leading-[1.05] tracking-[-0.035em] min-[400px]:text-[34px] sm:mt-4 sm:text-[64px] sm:leading-[1.02] sm:tracking-[-0.04em]"
            >
              {registeredMember ? "You're on the board." : "Paste your username."}
              <br />
              {registeredMember ? currentMember ? `Ranked #${formatFull(currentMember.rank)}.` : "Rank is updating." : "Take your place."}
            </h1>
            {page && <p className="mx-auto mt-3 max-w-md text-balance text-sm leading-relaxed text-t3 sm:mt-4">{page.summary}</p>}

            <div className="mt-6 w-full max-w-xl sm:mt-10">
              <RankMe
                board={board}
                me={me}
                onLocate={locate}
                onJoined={(login) => {
                  setMe(login.toLowerCase());
                  locate(login);
                }}
                onRules={() => setHowOpen(true)}
              />
            </div>
          </section>

          <section
            id="board"
            className="mt-8 scroll-mt-8 sm:mt-10"
            aria-labelledby="board-title"
          >
            <h2 id="board-title" className="sr-only">
              {activeTab === "tools" ? "Developer tools" : activeTab === "repositories" ? "Repository spotlight" : "Developer leaderboard"}
            </h2>
            <Tabs
              className="grid grid-cols-1 items-start gap-x-3 sm:grid-cols-[1fr_auto]"
              value={activeTab}
              onValueChange={(value) => {
                selectPage(`${value === "developers" ? "/" : `/${value}`}${periodSearch}`);
              }}
            >
              <div className={`mb-5 flex justify-center sm:mb-8 ${activeTab === "developers" ? "sm:justify-start" : "sm:col-span-2"}`}>
                <TabsList aria-label="Leaderboard type" className="grid h-auto w-full grid-cols-[1fr_1.15fr_0.7fr] min-[480px]:inline-flex min-[480px]:w-auto">
                  <TabsTrigger value="developers" className="min-h-14 min-w-0 flex-col gap-0.5 px-2 text-xs min-[480px]:min-h-11 min-[480px]:flex-row min-[480px]:gap-0 sm:px-3 sm:text-sm">
                    {activeTab === "developers" && <TabPill />}
                    <span className="relative">Developers</span>{" "}
                    <TabCount count={members.length} />
                  </TabsTrigger>
                  <TabsTrigger value="repositories" className="min-h-14 min-w-0 flex-col gap-0.5 px-2 text-xs min-[480px]:min-h-11 min-[480px]:flex-row min-[480px]:gap-0 sm:px-3 sm:text-sm">
                    {activeTab === "repositories" && <TabPill />}
                    <span className="relative">Spotlight</span>{" "}
                    <TabCount count={repositories.length} />
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="min-h-14 min-w-0 flex-col gap-0.5 px-2 text-xs min-[480px]:min-h-11 min-[480px]:flex-row min-[480px]:gap-0 sm:px-3 sm:text-sm">
                    {activeTab === "tools" && <TabPill />}
                    <span className="relative">Tools</span>{" "}
                    <TabCount count={toolCount} />
                  </TabsTrigger>
                </TabsList>
              </div>

              {isError && !board && !toolsOpen ? (
                <div className="surface-quiet col-span-full flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center">
                  <p className="text-sm text-t2">Couldn't load the board.</p>
                  <TextureButton
                    variant="minimal"
                    size="sm"
                    className="w-auto"
                    onClick={() => refetch()}
                    loading={isRefetching}
                  >
                    {!isRefetching && <RefreshIcon size={14} aria-hidden />}
                    {isRefetching ? "Retrying…" : "Try again"}
                  </TextureButton>
                </div>
              ) : (
                <TabsContent value="developers" className="contents" asChild>
                  <Tabs value={period} onValueChange={(value) => {
                    const search = new URLSearchParams(location.search);
                    if (value === "all") search.delete("period"); else search.set("period", value);
                    const query = search.toString();
                    selectPage(`${location.pathname}${query ? `?${query}` : ""}`);
                  }}>
                  <div className="mb-5 flex justify-center sm:mb-8 sm:justify-end">
                    <TabsList aria-label="Ranking period">
                      {RANKING_PERIODS.map((value) => <TabsTrigger key={value} value={value} className="min-h-11 px-3 text-xs data-[state=active]:bg-foreground/[0.1] sm:px-4 sm:text-xs">{rankingPeriodLabels[value]}</TabsTrigger>)}
                    </TabsList>
                  </div>
                  <TabsContent value={period} className="col-span-full mt-0" asChild>
                  <TabPanel>
                  {periodUnavailable ? <p role="status" className="surface-quiet rounded-2xl px-4 py-8 text-center text-sm text-t3">This period is waiting for help history. Try again shortly.</p> : isPending ? <BoardSkeleton /> : <LeaderboardPodium
                    entries={podium}
                    currentUserId={me}
                    flashId={flashId}
                  />}

                  {!isPending && !periodUnavailable && members.length === 0 && (
                    <EmptyState
                      icon={<UsersGroupRoundedIcon size={22} aria-hidden />}
                      title="Nobody's on the board yet"
                      body="Paste your GitHub username above and take #1."
                    />
                  )}

                  {!isPending && members.length > 0 && <div ref={pagination.regionRef} tabIndex={-1} className="mt-4 scroll-mt-6 sm:mt-6">
                    {rest.length > 0 && <div className="mb-3 flex items-center justify-end gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t4">Sort</span>
                      <div role="group" aria-label="Sort developers" className="inline-flex rounded-full bg-foreground/[0.06] p-0.5">
                        {(["rank", "streak"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={sortBy === option}
                            onClick={() => setSortBy(option)}
                            className={cn("rounded-full px-3 py-1 text-xs transition-colors", sortBy === option ? "bg-foreground/[0.1] text-foreground" : "text-t3 hover:text-t2")}
                          >
                            {option === "rank" ? "Rank" : "Streak"}
                          </button>
                        ))}
                      </div>
                    </div>}
                    <RankTable
                      members={pagination.items}
                      total={pagination.total}
                      meId={me}
                      flashId={flashId}
                      achievementCounts={board?.achievementCounts}
                      memberCount={board?.members.length ?? 0}
                      period={period}
                    />
                    <Pagination {...pagination} label="Developers" onPageChange={pagination.changePage} />
                  </div>}
                  </TabPanel>
                  </TabsContent>
                  </Tabs>
                </TabsContent>
              )}
              <TabsContent value="repositories" asChild>
                <TabPanel className="col-span-full">
                {isPending ? (
                  <BoardSkeleton repositories />
                ) : repositories.length > 0 ? (
                  <>
                    <LeaderboardPodium entries={repoPodium} unit="stars" ariaLabel="Top three spotlight repos" />
                    <div className="mt-4 sm:mt-6">
                      <RepositoryExplorer repositories={repositories} />
                    </div>
                  </>
                ) : (
                  !isError && (
                    <EmptyState
                      icon={<FolderWithFilesIcon size={22} aria-hidden />}
                      title="No spotlight repos yet"
                      body="One project per developer, with at least 5 stars. Join the board to add yours."
                    />
                  )
                )}
                </TabPanel>
              </TabsContent>
              <TabsContent value="tools" className="col-span-full">
                <ToolsDirectory />
              </TabsContent>
            </Tabs>
          </section>
        </main>

        <SiteFooter />
      </div>

      <Dock
        invite={board?.invite}
        onRank={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          window.setTimeout(
            () =>
              document
                .getElementById("github-input")
                ?.focus({ preventScroll: true }),
            400,
          );
        }}
      />

      <HowItWorks
        open={howItWorks}
        onOpenChange={setHowOpen}
        weights={board?.weights}
        helpersDelayed={board?.helpersDelayed}
      />
    </div>
  );
};

export default Index;
