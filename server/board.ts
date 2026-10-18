import { DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "../shared/brand.js";
import {
  compareStanding,
  communityScore,
  contributionStart,
  DEFAULT_WEIGHTS,
  scoreOf,
} from "../shared/ranking.js";
import type {
  Board,
  GithubRepository,
  GithubStats,
  Preview,
  PublicMember,
  PublicRepository,
  RegisterResult,
} from "../shared/types.js";
import {
  parseGithubInput,
  parseNickname,
  parseWhatsappNumber,
} from "../shared/validation.js";
import {
  ACHIEVEMENT_IDS,
  computeStreaks,
  evaluateAchievements,
  mergeActivityDays,
  nextGoals,
  utcDay,
  type MemberProgression,
  type ProgressionSignals,
} from "../shared/progression.js";
import { GithubError, lookupMany, lookupOne, type Lookup } from "./github.js";
import { HttpError } from "./http.js";
import { getCommunityStore } from "./community-store.js";
import type { AppConfig, MemberRecord, Store } from "./store.js";
import { requireWhatsappMembership } from "./whatsapp.js";
import { COMMUNITY_REPOSITORY, pickSpotlight, spotlightCandidates } from "../shared/spotlight.js";
import { coordinationRequest } from "./participation.js";
import { RANKING_PERIODS, type HelperHistory, type HelperPeriodScores, type RankingPeriod } from "../shared/coordination.js";
import { communityStarHelps, STAR_HELP_POINTS } from "../shared/star-help.js";
import { lookupCommunityRepository } from "./community-spotlight.js";

const REFRESH_EVERY_MS = 60_000;
const RANKING_VERSION = 6;
// Held for this long after a failed refresh, so a rate-limited GitHub isn't retried on every poll.
const REFRESH_LOCK_S = 50;
// With more members than this, each tick refreshes the stalest ones and the rest wait their turn.
const REFRESH_LIMIT = 48;
// Arrows show places gained or lost over (roughly) the last day.
const MOVEMENT_WINDOW_MS = 24 * 3_600_000;
const NEW_WINDOW_MS = 24 * 3_600_000;

export async function loadConfig(store: Store): Promise<AppConfig> {
  const saved = await store.getConfig();
  return {
    invite: {
      url: DEFAULT_INVITE_URL,
      open: true,
      note: DEFAULT_INVITE_NOTE,
      ...saved?.invite,
    },
    weights: { ...DEFAULT_WEIGHTS, ...saved?.weights },
  };
}

function statsFields(stats: GithubStats): Partial<MemberRecord> {
  return {
    displayLogin: stats.login,
    name: stats.name,
    avatarUrl: stats.avatarUrl,
    stars: stats.stars,
    followers: stats.followers,
    repos: stats.repos,
    activity: stats.activity,
    activitySince: stats.activitySince,
    reviews: stats.reviews ?? 0,
    issues: stats.issues ?? 0,
    projects: stats.projects ?? [],
    starredRepositories: stats.starredRepositories ?? [],
    starSupportUpdatedAt: Date.now(),
    starHistoryVersion: stats.starHistoryVersion ?? 0,
  };
}

/** The verified signals a member record contributes to achievement checks. */
function progressionSignals(record: MemberRecord, extra: Partial<ProgressionSignals> = {}): ProgressionSignals {
  return {
    activityDays: record.activityDays ?? [],
    longestStreak: record.longestStreak ?? 0,
    // A stored activity total only counts once it covers the member's whole
    // life on the board; otherwise it predates them and must not award.
    contributions: record.activitySince === contributionStart(record.createdAt) ? record.activity : 0,
    helpedMembers: record.helpedMembers,
    reviews: record.reviews,
    issues: record.issues,
    stars: record.stars,
    followers: record.followers,
    ...extra,
  };
}

function repositoryUpvotes(projects: GithubRepository[], counts: Record<string, number>): number {
  return [...new Set(projects.map((repo) => repo.id))]
    .reduce((total, id) => total + (counts[`repo:${id}`] ?? 0), 0);
}

/** Ranks every visible member, records rank movement, and writes the public snapshot. */
export async function rebuildBoard(
  store: Store,
  opts: { refreshedAt?: number; statsDelayed?: boolean; voteCounts?: Record<string, number>; communityRepository?: PublicRepository | null; communityRepositoryCheckedAt?: number; communityRepositoryDelayed?: boolean } = {},
): Promise<Board> {
  const [records, config, previous, votes] = await Promise.all([
    store.listMembers(),
    loadConfig(store),
    store.getBoard(),
    opts.voteCounts ?? getCommunityStore().readVotes("").then((result) => result.counts),
  ]);
  const now = Date.now();
  let helpersCheckedAt = previous?.helpersCheckedAt ?? 0;
  let helpersUpdatedAt = previous?.helpersUpdatedAt ?? 0;
  let helpersDelayed = previous?.helpersDelayed ?? true;
  if (now - helpersCheckedAt >= REFRESH_EVERY_MS || previous?.rankingVersion !== RANKING_VERSION || (previous.helperHistoryReady && records.some((record) => !record.hidden && !record.helperPeriods))) {
    helpersCheckedAt = now;
    let helpers: HelperHistory | null = null;
    try {
      helpers = await coordinationRequest<HelperHistory>("helpers", { version: 2 });
    } catch {
      helpersDelayed = true;
    }
    if (helpers) {
      const scores = Object.fromEntries(RANKING_PERIODS.map((period) => [period, new Map(helpers.periods[period].members.map((entry) => [entry.login.toLowerCase(), entry]))])) as Record<RankingPeriod, Map<string, HelperHistory["periods"]["all"]["members"][number]>>;
      await Promise.all(records.map(async (record) => {
        const helperPeriods = Object.fromEntries(RANKING_PERIODS.map((period) => {
          const score = scores[period].get(record.login.toLowerCase());
          return [period, { points: score?.points ?? 0, contributions: score?.contributions ?? 0, peers: score?.peers ?? 0 }];
        })) as HelperPeriodScores;
        const helper = helperPeriods.all;
        const patch = { helperPoints: helper.points, helpfulContributions: helper.contributions, helpedMembers: helper.peers, helperPeriods };
        if ((record.helperPoints ?? 0) !== patch.helperPoints || (record.helpfulContributions ?? 0) !== patch.helpfulContributions || (record.helpedMembers ?? 0) !== patch.helpedMembers || JSON.stringify(record.helperPeriods) !== JSON.stringify(helperPeriods)) await store.patchMember(record.login, patch);
        Object.assign(record, patch);
      }));
      helpersUpdatedAt = helpers.generatedAt;
      helpersDelayed = false;
    }
  }

  const today = utcDay(now);
  await Promise.all(records.map(async (record) => {
    const days = mergeActivityDays(record.activityDays);
    const { current, longest, start } = computeStreaks(days, today, record.longestStreak, record.streakStart);
    const earned = evaluateAchievements(
      progressionSignals(record, { activityDays: days, longestStreak: longest }),
      record.achievements,
      now,
    );
    const awards: Record<string, number> = {};
    for (const [id, at] of Object.entries(earned)) if (!(id in (record.achievements ?? {}))) awards[id] = at;
    const patch: Partial<MemberRecord> = {};
    if (days.length !== (record.activityDays?.length ?? 0)) patch.activityDays = days;
    if (current !== (record.currentStreak ?? 0)) patch.currentStreak = current;
    if (longest !== (record.longestStreak ?? 0)) patch.longestStreak = longest;
    if (start !== (record.streakStart ?? "")) patch.streakStart = start;
    if (Object.keys(patch).length > 0) await store.patchMember(record.login, patch);
    if (Object.keys(awards).length > 0) await store.mergeAchievements(record.login, awards);
    Object.assign(record, patch, { achievements: { ...awards, ...(record.achievements ?? {}) } });
  }));

  const visibleLogins = new Set(records.filter((record) => !record.hidden).map((record) => record.login.toLowerCase()));
  const rankedFor = (period: RankingPeriod) => records
    .filter((m) => !m.hidden)
    .map((record) => {
      const activity = record.activitySince === contributionStart(record.createdAt) ? record.activity : 0;
      const upvotes = repositoryUpvotes(record.projects ?? [], votes);
      const starHelps = communityStarHelps(record.login, record.starredRepositories ?? [], visibleLogins, now, period);
      const help = record.helperPeriods?.[period];
      const helperPoints = (help?.points ?? record.helperPoints ?? 0) + starHelps * STAR_HELP_POINTS;
      const m = { ...record, activity, upvotes, helperPoints, starHelps, helpfulContributions: help?.contributions ?? record.helpfulContributions ?? 0, helpedMembers: help?.peers ?? record.helpedMembers ?? 0 };
      const githubScore = scoreOf(m, config.weights);
      return { m: { ...m, githubScore }, score: communityScore(githubScore, m.helperPoints) };
    })
    .sort((a, b) =>
      compareStanding({ ...a.m, score: a.score }, { ...b.m, score: b.score }),
    );
  const ranked = rankedFor("all");

  const achievementCounts: Record<string, number> = {};
  for (const id of ACHIEVEMENT_IDS) achievementCounts[id] = 0;
  for (const record of records) {
    if (record.hidden) continue;
    for (const id of Object.keys(record.achievements ?? {}))
      if (id in achievementCounts) achievementCounts[id] += 1;
  }

  const writes: Promise<void>[] = [];
  const members: PublicMember[] = ranked.map(({ m, score }, i) => {
    const rank = i + 1;
    // prevRank is the rank a movement window started from, so three drops in
    // an hour read as ↓3, not ↓1. Landing on the board for the first time isn't a move.
    let { prevRank, rankChangedAt } = m;
    if (m.rank !== rank) {
      const windowOpen =
        prevRank > 0 && now - rankChangedAt < MOVEMENT_WINDOW_MS;
      if (m.rank > 0 && !windowOpen) {
        prevRank = m.rank;
        rankChangedAt = now;
      }
      writes.push(
        store.patchMember(m.login, { rank, prevRank, rankChangedAt }),
      );
    }
    const recent = prevRank > 0 && now - rankChangedAt < MOVEMENT_WINDOW_MS;
    return {
      login: m.displayLogin,
      nickname: m.nickname,
      avatarUrl: m.avatarUrl,
      score,
      stars: m.stars,
      followers: m.followers,
      repos: m.repos,
      activity: m.activity,
      upvotes: m.upvotes,
      helperPoints: m.helperPoints ?? 0,
      helpfulContributions: m.helpfulContributions ?? 0,
      starHelps: m.starHelps,
      helpedMembers: m.helpedMembers ?? 0,
      githubScore: m.githubScore,
      rank,
      delta: recent ? prevRank - rank : 0,
      isNew: now - m.createdAt < NEW_WINDOW_MS,
      currentStreak: m.currentStreak ?? 0,
      longestStreak: m.longestStreak ?? 0,
      achievements: Object.keys(m.achievements ?? {}),
    };
  });

  for (const m of records) {
    if (m.hidden && m.rank !== 0)
      writes.push(
        store.patchMember(m.login, { rank: 0, prevRank: 0, rankChangedAt: 0 }),
      );
  }
  await Promise.all(writes);

  const helperHistoryReady = records.filter((record) => !record.hidden).every((record) => Boolean(record.helperPeriods));
  const publicMembers = new Map(members.map((member) => [member.login.toLowerCase(), member]));
  const periods = helperHistoryReady ? Object.fromEntries((["7d", "30d"] as const).map((period) => [period, rankedFor(period).map(({ m, score }, index) => ({
    ...publicMembers.get(m.login)!, score, rank: index + 1, delta: 0,
    helperPoints: m.helperPoints, helpfulContributions: m.helpfulContributions, helpedMembers: m.helpedMembers, starHelps: m.starHelps,
  }))])) as Board["periods"] : undefined;

  const communityRepository = opts.communityRepository === undefined
    ? previous?.repositories?.find((repo) => repo.fullName.toLowerCase() === COMMUNITY_REPOSITORY)
    : opts.communityRepository;
  const memberRepositories: PublicRepository[] = ranked
    .flatMap(({ m }) => {
      const repo = pickSpotlight(m.projects ?? [], m.spotlightRepositoryId);
      return repo ? [{
        ...repo,
        rank: 0,
        ownerLogin: m.displayLogin,
        ownerNickname: m.nickname,
        ownerAvatarUrl: m.avatarUrl,
      }] : [];
    });
  const repositories = [...new Map([...memberRepositories, ...(communityRepository ? [communityRepository] : [])].map((repo) => [repo.id, repo])).values()]
    .sort(
      (a, b) =>
        b.stars - a.stars ||
        b.forks - a.forks ||
        a.fullName.localeCompare(b.fullName),
    )
    .map((repo, i) => ({ ...repo, rank: i + 1 }));

  const board: Board = {
    rankingVersion: RANKING_VERSION,
    helpersCheckedAt,
    helpersUpdatedAt,
    helpersDelayed,
    helperHistoryReady,
    periods,
    communityRepositoryCheckedAt: opts.communityRepositoryCheckedAt ?? previous?.communityRepositoryCheckedAt ?? 0,
    communityRepositoryDelayed: opts.communityRepositoryDelayed ?? previous?.communityRepositoryDelayed ?? true,
    members,
    repositories,
    achievementCounts,
    updatedAt: now,
    refreshedAt: opts.refreshedAt ?? previous?.refreshedAt ?? now,
    statsDelayed: ranked.some(({ m }) => m.activitySince !== contributionStart(m.createdAt) || !m.starSupportUpdatedAt || m.starHistoryVersion !== 2) || (opts.statsDelayed ?? previous?.statsDelayed ?? false),
    invite: config.invite,
    weights: config.weights,
  };
  await store.setBoard(board);
  return board;
}

/**
 * One member's verified progression for the detail dialog and portfolio.
 * Hidden members have no public progression, so they read as missing.
 */
export async function readProgression(store: Store, login: string): Promise<MemberProgression | null> {
  const records = await store.listMembers();
  const record = records.find((m) => m.login === login.toLowerCase());
  if (!record || record.hidden) return null;
  const now = Date.now();
  const today = utcDay(now);
  const days = mergeActivityDays(record.activityDays);
  const { current, longest } = computeStreaks(days, today, record.longestStreak, record.streakStart);
  const counts: Record<string, number> = {};
  for (const id of ACHIEVEMENT_IDS) counts[id] = 0;
  for (const m of records) {
    if (m.hidden) continue;
    for (const id of Object.keys(m.achievements ?? {}))
      if (id in counts) counts[id] += 1;
  }
  return {
    login: record.displayLogin,
    nickname: record.nickname,
    currentStreak: current,
    longestStreak: longest,
    achievements: record.achievements ?? {},
    activityDays: days,
    counts,
    total: records.filter((m) => !m.hidden).length,
    goals: nextGoals(progressionSignals(record, { activityDays: days, longestStreak: longest }), record.achievements, now),
  };
}

/**
 * Grants the portfolio achievement when a member publishes their portfolio.
 * Members who never published before this feature existed pick it up on their
 * next publish. No-op for portfolio owners who aren't on the board.
 */
export async function awardPortfolioAchievement(store: Store, login: string): Promise<void> {
  const record = await store.getMember(login.toLowerCase());
  if (!record) return;
  const earned = evaluateAchievements(progressionSignals(record, { hasPortfolio: true }), record.achievements);
  const awards: Record<string, number> = {};
  for (const [id, at] of Object.entries(earned)) if (!(id in (record.achievements ?? {}))) awards[id] = at;
  if (Object.keys(awards).length > 0) await store.mergeAchievements(record.login, awards);
}

async function refreshStats(store: Store): Promise<Board> {
  const now = Date.now();
  const previous = await store.getBoard();
  const due = (await store.listMembers())
    .filter((m) => !m.hidden)
    .filter((m) => m.activitySince !== contributionStart(m.createdAt) || !m.starSupportUpdatedAt || now - m.statsUpdatedAt >= REFRESH_EVERY_MS - 5_000)
    .sort((a, b) => a.statsUpdatedAt - b.statsUpdatedAt)
    .slice(0, REFRESH_LIMIT);

  const [outcome, communityUpdate] = await Promise.all([
    due.length > 0 ? lookupMany(due.map((m) => m.login), new Map(due.map((m) => [m.login, m.createdAt]))) : Promise.resolve({ results: new Map<string, Lookup>(), error: undefined }),
    now - (previous?.communityRepositoryCheckedAt ?? 0) >= REFRESH_EVERY_MS
      ? lookupCommunityRepository().then((communityRepository) => ({ communityRepository, communityRepositoryCheckedAt: now, communityRepositoryDelayed: false })).catch(() => ({ communityRepositoryCheckedAt: now, communityRepositoryDelayed: true }))
      : Promise.resolve({}),
  ]);
  let delayed = false;
  if (due.length > 0) {
    if (outcome.error) {
      console.warn(
        `GitHub refresh: ${outcome.error.code}: ${outcome.error.message}`,
      );
      delayed = true;
    }
    await Promise.all(
      due.map((m) => {
        const r = outcome.results.get(m.login);
        if (!r || r.kind === "error") delayed = true;
        if (r?.kind === "user")
          return store.patchMember(m.login, {
            ...statsFields(r.stats),
            activityDays: mergeActivityDays(m.activityDays, r.stats.activityDays),
            statsUpdatedAt: now,
          });
        // Renamed or deleted on GitHub: keep the last known numbers; admin can remove them.
        if (r?.kind === "missing" || r?.kind === "organization")
          return store.patchMember(m.login, { statsUpdatedAt: now });
        return Promise.resolve();
      }),
    );
  }
  return rebuildBoard(store, {
    ...communityUpdate,
    refreshedAt: delayed ? undefined : now,
    statsDelayed: delayed,
  });
}

async function refreshInBackground(store: Store): Promise<void> {
  try {
    const fresh = await refreshStats(store);
    if (!fresh.statsDelayed) await store.unlock("refresh");
  } catch (err) {
    console.error("Board refresh failed", err);
  }
}

/**
 * The public board, always answered from the stored snapshot so the page
 * never waits on GitHub. When stats are a minute stale, the first reader to
 * notice kicks off a refresh; `background` keeps that work alive after the
 * response is sent (Vercel's waitUntil), and the next poll picks it up.
 */
export async function readBoard(
  store: Store,
  background: (work: Promise<unknown>) => void = () => {},
): Promise<Board> {
  const saved = await store.getBoard();
  const board = saved?.repositories && saved.rankingVersion === RANKING_VERSION
    ? saved
    : await rebuildBoard(store, saved ? { refreshedAt: 0 } : {});
  if (
    (Date.now() - board.refreshedAt >= REFRESH_EVERY_MS || Date.now() - (board.helpersCheckedAt ?? 0) >= REFRESH_EVERY_MS || Date.now() - (board.communityRepositoryCheckedAt ?? 0) >= REFRESH_EVERY_MS) &&
    (await store.tryLock("refresh", REFRESH_LOCK_S))
  ) {
    background(refreshInBackground(store));
  }
  return board;
}

function requireUser(lookup: Lookup, login: string): GithubStats {
  if (lookup.kind === "user") return lookup.stats;
  if (lookup.kind === "organization") {
    throw new HttpError(
      422,
      "organization",
      `${login} is an organisation. Use your personal GitHub profile.`,
      "github",
    );
  }
  if (lookup.kind === "missing") {
    throw new HttpError(
      404,
      "not_found",
      `There's no GitHub user called ${login}. Check the spelling.`,
      "github",
    );
  }
  throw new HttpError(
    503,
    "github_unavailable",
    "GitHub isn't answering right now. Try again in a minute.",
  );
}

async function fetchUser(login: string, joinedAt = Date.now()): Promise<GithubStats> {
  try {
    return requireUser(await lookupOne(login, joinedAt), login);
  } catch (err) {
    if (err instanceof GithubError) {
      console.warn(`GitHub lookup: ${err.code}: ${err.message}`);
      throw new HttpError(
        503,
        "github_unavailable",
        "GitHub isn't answering right now. Try again in a minute.",
      );
    }
    throw err;
  }
}

export async function previewProfile(
  store: Store,
  input: string,
  phone = "",
): Promise<Preview> {
  const parsed = parseGithubInput(input);
  if (!parsed.ok)
    throw new HttpError(400, "invalid_github", parsed.error, "github");
  const whatsapp = parseWhatsappNumber(phone);
  if (!whatsapp.ok)
    throw new HttpError(400, "invalid_whatsapp", whatsapp.error, "whatsapp");
  await requireWhatsappMembership(whatsapp.value);
  const existing = await store.getMember(parsed.value.toLowerCase());
  const [profile, config, votes, records] = await Promise.all([
    fetchUser(parsed.value, existing?.createdAt),
    loadConfig(store),
    getCommunityStore().readVotes(""),
    store.listMembers(),
  ]);
  const upvotes = repositoryUpvotes(profile.projects ?? [], votes.counts);
  const githubScore = scoreOf({ ...profile, upvotes }, config.weights);
  const visibleLogins = new Set(records.filter((record) => !record.hidden).map((record) => record.login.toLowerCase()));
  const starHelps = communityStarHelps(profile.login, profile.starredRepositories ?? [], visibleLogins, Date.now());
  const helperPoints = (existing?.helperPoints ?? 0) + starHelps * STAR_HELP_POINTS;
  const { starredRepositories: ignoredStars, ...publicProfile } = profile;
  return { profile: { ...publicProfile, projects: spotlightCandidates(profile.projects ?? []) }, score: communityScore(githubScore, helperPoints), githubScore, helpedMembers: existing?.helpedMembers ?? 0, helperPoints };
}

function field(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
}

export async function register(
  store: Store,
  body: unknown,
): Promise<RegisterResult> {
  const nickname = parseNickname(field(body, "nickname"));
  if (!nickname.ok)
    throw new HttpError(400, "invalid_nickname", nickname.error, "nickname");
  const github = parseGithubInput(field(body, "github"));
  if (!github.ok)
    throw new HttpError(400, "invalid_github", github.error, "github");
  const whatsapp = parseWhatsappNumber(field(body, "whatsapp"));
  if (!whatsapp.ok)
    throw new HttpError(400, "invalid_whatsapp", whatsapp.error, "whatsapp");

  const spotlightRepositoryId = (body as Record<string, unknown> | null)?.spotlightRepositoryId;
  if (spotlightRepositoryId !== undefined && (typeof spotlightRepositoryId !== "string" || !spotlightRepositoryId || spotlightRepositoryId.length > 200)) {
    throw new HttpError(400, "invalid_spotlight", "Choose a repository with at least 5 stars, or use the automatic pick.", "spotlightRepositoryId");
  }

  await requireWhatsappMembership(whatsapp.value);

  const existing = await store.getMember(github.value.toLowerCase());
  if (existing) {
    if (existing.hidden) {
      throw new HttpError(
        409,
        "removed",
        "This account was taken off the board by an admin. Message the organiser.",
        "github",
      );
    }
    // A double-submit from the same person is a success, not a conflict.
    if (existing.whatsapp === whatsapp.value)
      return { login: existing.displayLogin, board: await rebuildBoard(store) };
    throw new HttpError(
      409,
      "github_taken",
      "That GitHub account is already on the board.",
      "github",
    );
  }

  const now = Date.now();
  const stats = await fetchUser(github.value, now);
  if (spotlightRepositoryId !== undefined && !spotlightCandidates(stats.projects ?? []).some((repo) => repo.id === spotlightRepositoryId)) {
    throw new HttpError(400, "invalid_spotlight", "That repository is no longer eligible. Choose another with at least 5 stars, or use the automatic pick.", "spotlightRepositoryId");
  }
  const record: MemberRecord = {
    login: stats.login.toLowerCase(),
    displayLogin: stats.login,
    nickname: nickname.value,
    whatsapp: whatsapp.value,
    avatarUrl: stats.avatarUrl,
    name: stats.name,
    stars: stats.stars,
    followers: stats.followers,
    repos: stats.repos,
    activity: stats.activity,
    activitySince: stats.activitySince,
    reviews: stats.reviews ?? 0,
    issues: stats.issues ?? 0,
    activityDays: mergeActivityDays([], stats.activityDays),
    projects: stats.projects ?? [],
    starredRepositories: stats.starredRepositories ?? [],
    starSupportUpdatedAt: now,
    spotlightRepositoryId,
    hidden: false,
    createdAt: now,
    statsUpdatedAt: now,
    rank: 0,
    prevRank: 0,
    rankChangedAt: 0,
  };

  const created = await store.createMember(record);
  if (!created.ok) {
    if (created.conflict === "github") {
      const saved = await store.getMember(record.login);
      if (saved && !saved.hidden && saved.whatsapp === whatsapp.value) {
        return { login: saved.displayLogin, board: await rebuildBoard(store) };
      }
    }
    const messages = {
      github: [
        "github_taken",
        "That GitHub account is already on the board.",
        "github",
      ],
      whatsapp: [
        "whatsapp_taken",
        "That WhatsApp number is already registered to another member.",
        "whatsapp",
      ],
      nickname: [
        "nickname_taken",
        "Someone already has that nickname. Pick another.",
        "nickname",
      ],
    } as const;
    const [code, message, fieldName] = messages[created.conflict];
    throw new HttpError(409, code, message, fieldName);
  }

  return { login: record.displayLogin, board: await rebuildBoard(store) };
}
