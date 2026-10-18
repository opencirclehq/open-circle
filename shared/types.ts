import type { RankingPeriod } from "./coordination.js";

export interface Weights {
  stars: number;
  followers: number;
  repos: number;
  /** Repos past this count earn nothing, so 200 empty repos can't farm points. */
  reposCap: number;
  activity: number;
  upvotes: number;
}

export interface GithubStats {
  /** GitHub's own casing. Compare lowercased. */
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Stars across owned, non-fork public repos. */
  stars: number;
  followers: number;
  /** Owned, non-fork public repos. */
  repos: number;
  /** Public contributions (commits, PRs, reviews, issues, new repos) since the UTC day of joining. */
  activity: number;
  activitySince: number;
  /** Public commits since joining. */
  commits?: number;
  /** Public pull requests opened since joining. */
  pullRequests?: number;
  /** Public pull request reviews since joining. */
  reviews?: number;
  /** Public issues opened since joining. */
  issues?: number;
  /** UTC days with at least one public contribution, oldest first. */
  activityDays?: string[];
  projects?: GithubRepository[];
  starredRepositories?: GithubStar[];
  starHistoryVersion?: number;
}

export interface GithubStar {
  repositoryId: string;
  ownerLogin: string;
  starredAt: number;
}

export interface GithubRepository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  updatedAt: string;
}

export interface PublicRepository extends GithubRepository {
  rank: number;
  ownerLogin: string;
  ownerNickname: string;
  ownerAvatarUrl: string;
}

/** A member as the public board sees them. Never carries the WhatsApp number. */
export interface PublicMember {
  login: string;
  nickname: string;
  avatarUrl: string;
  score: number;
  stars: number;
  followers: number;
  repos: number;
  activity: number;
  upvotes: number;
  rank: number;
  helperPoints?: number;
  helpfulContributions?: number;
  starHelps?: number;
  helpedMembers?: number;
  githubScore?: number;
  /** Places gained (+) or lost (−) on the last move, if it happened in the last 24h. */
  delta: number;
  /** Joined in the last 24h. */
  isNew: boolean;
  /** Consecutive UTC days with verified activity, ending today or yesterday. */
  currentStreak?: number;
  /** Longest verified daily streak on record. */
  longestStreak?: number;
  /** Achievement ids this member has earned. */
  achievements?: string[];
}

export interface InviteConfig {
  url: string;
  /** False when the link is full or stale; the CTA then shows `note` instead. */
  open: boolean;
  note: string;
}

export interface Board {
  rankingVersion?: number;
  helpersCheckedAt?: number;
  helpersUpdatedAt?: number;
  helpersDelayed?: boolean;
  helperHistoryReady?: boolean;
  periods?: Record<Exclude<RankingPeriod, "all">, PublicMember[]>;
  communityRepositoryCheckedAt?: number;
  communityRepositoryDelayed?: boolean;
  members: PublicMember[];
  repositories: PublicRepository[];
  /** How many members have earned each achievement id, for rarity hints. */
  achievementCounts?: Record<string, number>;
  /** When this snapshot was written. Clients never replace a newer one with an older one. */
  updatedAt: number;
  /** When GitHub stats were last pulled. */
  refreshedAt: number;
  /** The last GitHub pull failed; the board is showing older numbers. */
  statsDelayed: boolean;
  invite: InviteConfig;
  weights: Weights;
}

export interface Preview {
  profile: GithubStats;
  score: number;
  githubScore?: number;
  helpedMembers?: number;
  helperPoints?: number;
}

export interface RegisterInput {
  nickname: string;
  github: string;
  whatsapp: string;
  spotlightRepositoryId?: string;
}

export interface RegisterResult {
  login: string;
  board: Board;
}

export interface AdminMember extends PublicMember {
  whatsapp: string;
  hidden: boolean;
  createdAt: number;
  statsUpdatedAt: number;
}

export interface AdminConfig {
  invite: InviteConfig;
  weights: Weights;
}

export interface AdminState {
  members: AdminMember[];
  config: AdminConfig;
}

export interface AdminSession {
  configured: boolean;
  profile: { id: number; login: string; avatarUrl: string } | null;
}

export type AdminAction =
  | { action: "hide" | "unhide" | "remove"; login: string }
  | { action: "config"; config: AdminConfig };

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string };
}
