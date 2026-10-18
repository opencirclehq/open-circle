import type { GithubRepository, GithubStar, GithubStats } from "../shared/types.js";
import { contributionStart } from "../shared/ranking.js";
import { isUtcDay, normalizeDays } from "../shared/progression.js";

export type GithubErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "upstream";

export class GithubError extends Error {
  constructor(
    readonly code: GithubErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Lookup =
  | { kind: "user"; stats: GithubStats }
  | { kind: "organization" }
  | { kind: "missing" }
  | { kind: "error" };

type Outcome = { results: Map<string, Lookup>; error?: GithubError };
const ENDPOINT = "https://api.github.com/graphql";
const BATCH_SIZE = 4;
const CONCURRENCY = 3;
const TIMEOUT_MS = 20_000;
const CONTRIBUTION_FIELDS = [
  "totalCommitContributions", "totalIssueContributions", "totalPullRequestContributions",
  "totalPullRequestReviewContributions", "totalRepositoryContributions",
] as const;
const CALENDAR_FIELD = `contributionCalendar {
  weeks { contributionDays { date contributionCount } }
}`;

/**
 * UTC days with at least one verified public contribution in one collection
 * window. The calendar counts private/restricted contributions too, without
 * saying which day they landed on, so a window that mixed them in is discarded
 * rather than credited as public activity.
 */
function calendarDays(collection: unknown): string[] {
  const value = collection as { contributionCalendar?: { weeks?: unknown }; hasAnyRestrictedContributions?: unknown } | null;
  if (value?.hasAnyRestrictedContributions === true) return [];
  const weeks = value?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) return [];
  const days: string[] = [];
  for (const week of weeks) {
    const list = (week as { contributionDays?: unknown } | null)?.contributionDays;
    if (!Array.isArray(list)) continue;
    for (const day of list) {
      const entry = day as { date?: unknown; contributionCount?: unknown } | null;
      if (isUtcDay(entry?.date) && Number.isSafeInteger(entry?.contributionCount) && (entry?.contributionCount as number) > 0)
        days.push(entry!.date as string);
    }
  }
  return days;
}

const REPO_FIELDS = `
  totalCount
  pageInfo { hasNextPage endCursor }
  nodes {
    id name nameWithOwner url description stargazerCount forkCount updatedAt
    isPrivate isFork
    primaryLanguage { name }
  }
`;
const REPO_ARGS = `first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
  orderBy: { field: STARGAZERS, direction: DESC }`;
const STAR_ARGS = "first: 100, orderBy: { field: STARRED_AT, direction: DESC }";
const STAR_FIELDS = `
  isOverLimit
  pageInfo { hasNextPage endCursor }
  edges { starredAt node { id isPrivate isFork owner { __typename login } } }
`;
const OWNER_FRAGMENT = `
fragment Owner on RepositoryOwner {
  __typename login avatarUrl(size: 160)
  ... on User {
    name
    followers { totalCount }
    repositories(${REPO_ARGS}) { ${REPO_FIELDS} }
    starredRepositories(${STAR_ARGS}) { ${STAR_FIELDS} }
  }
}`;

interface RepoNode {
  id: string;
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  updatedAt: string;
  isPrivate: boolean;
  isFork: boolean;
  primaryLanguage: { name: string } | null;
}
interface RepoConnection {
  totalCount: number;
  nodes: (RepoNode | null)[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
interface OwnerNode {
  __typename: "User" | "Organization";
  login: string;
  avatarUrl: string;
  name?: string | null;
  followers?: { totalCount: number };
  repositories?: RepoConnection;
  starredRepositories?: StarConnection;
  [key: `activity${number}`]: Record<string, number> | null;
}
interface StarConnection {
  isOverLimit: boolean;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: ({ starredAt: string; node: { id: string; isPrivate: boolean; isFork: boolean; owner: { __typename: string; login: string } } } | null)[];
}
interface GraphqlResponse {
  data?: Record<string, OwnerNode | null> | null;
  errors?: { type?: string; message: string; path?: (string | number)[] }[];
}

async function queryGithub(
  query: string,
  variables: Record<string, string>,
  token: string,
  deadline: number,
): Promise<GraphqlResponse> {
  const remaining = deadline - Date.now();
  if (remaining < 1000)
    throw new GithubError(
      "upstream",
      "GitHub refresh will continue on the next cycle.",
    );
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "opencircle-leaderboard",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
    });
  } catch {
    throw new GithubError("upstream", "GitHub didn't answer in time.");
  }
  if (res.status === 401)
    throw new GithubError(
      "unauthorized",
      "GITHUB_TOKEN was rejected by GitHub.",
    );
  if (res.status === 403 || res.status === 429)
    throw new GithubError("rate_limited", "GitHub rate limit hit.");
  if (!res.ok)
    throw new GithubError("upstream", `GitHub responded ${res.status}.`);
  const body = (await res.json()) as GraphqlResponse;
  if (body.errors?.some((e) => e.type === "RATE_LIMITED")) {
    throw new GithubError("rate_limited", "GitHub rate limit hit.");
  }
  if (!body.data)
    throw new GithubError(
      "upstream",
      body.errors?.[0]?.message ?? "GitHub returned no data.",
    );
  return body;
}

function toProject(repo: RepoNode): GithubRepository {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.nameWithOwner,
    url: repo.url,
    description: repo.description,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    language: repo.primaryLanguage?.name ?? null,
    updatedAt: repo.updatedAt,
  };
}

async function allProjects(
  node: OwnerNode,
  token: string,
  deadline: number,
): Promise<GithubRepository[]> {
  let connection = node.repositories;
  const projects = new Map<string, GithubRepository>();
  const cursors = new Set<string>();
  while (connection) {
    for (const repo of connection.nodes) {
      if (repo && !repo.isPrivate && !repo.isFork)
        projects.set(repo.id, toProject(repo));
    }
    if (!connection.pageInfo.hasNextPage) break;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor))
      throw new GithubError(
        "upstream",
        "GitHub returned an incomplete repository page.",
      );
    cursors.add(cursor);
    const body = await queryGithub(
      `query($login: String!, $after: String!) {
        user(login: $login) { repositories(${REPO_ARGS}, after: $after) { ${REPO_FIELDS} } }
      }`,
      { login: node.login, after: cursor },
      token,
      deadline,
    );
    if (body.errors?.length || !body.data?.user?.repositories) {
      throw new GithubError(
        "upstream",
        "GitHub couldn't load all public repositories.",
      );
    }
    connection = body.data.user.repositories;
  }
  return [...projects.values()];
}

async function allStars(node: OwnerNode, token: string, deadline: number, now: number): Promise<GithubStar[]> {
  let connection = node.starredRepositories;
  const stars = new Map<string, GithubStar>();
  const cursors = new Set<string>();
  let previousTime = Infinity;
  while (true) {
    if (!connection || !Array.isArray(connection.edges) || typeof connection.isOverLimit !== "boolean" || typeof connection.pageInfo?.hasNextPage !== "boolean") {
      throw new GithubError("upstream", "GitHub couldn't load stars given.");
    }
    for (const edge of connection.edges) {
      const time = typeof edge?.starredAt === "string" ? Date.parse(edge.starredAt) : NaN;
      const repo = edge?.node;
      if (!Number.isSafeInteger(time) || time > now || time > previousTime || !repo || typeof repo.id !== "string" || !repo.id || typeof repo.isPrivate !== "boolean" || typeof repo.isFork !== "boolean" || typeof repo.owner?.login !== "string" || typeof repo.owner.__typename !== "string") {
        throw new GithubError("upstream", "GitHub returned incomplete star activity.");
      }
      previousTime = time;
      if (time <= 0) throw new GithubError("upstream", "GitHub returned invalid star activity.");
      if (!repo.isPrivate && !repo.isFork && repo.owner.__typename === "User" && repo.owner.login.toLowerCase() !== node.login.toLowerCase()) {
        stars.set(repo.id, { repositoryId: repo.id, ownerLogin: repo.owner.login.toLowerCase(), starredAt: time });
      }
    }
    if (!connection.pageInfo.hasNextPage) {
      if (connection.isOverLimit) throw new GithubError("upstream", "GitHub returned a truncated star history.");
      return [...stars.values()];
    }
    const cursor = connection.pageInfo.endCursor;
    if (!connection.edges.length || typeof cursor !== "string" || !cursor || cursors.has(cursor)) {
      throw new GithubError("upstream", "GitHub returned an incomplete star page.");
    }
    cursors.add(cursor);
    const body = await queryGithub(
      `query($login: String!, $after: String!) {
        user(login: $login) { starredRepositories(${STAR_ARGS}, after: $after) { ${STAR_FIELDS} } }
      }`,
      { login: node.login, after: cursor }, token, deadline,
    );
    if (body.errors?.length) throw new GithubError("upstream", "GitHub couldn't load all stars given.");
    connection = body.data?.user?.starredRepositories;
  }
}

async function lookupBatch(
  logins: string[],
  token: string,
  deadline: number,
  joinedAt: ReadonlyMap<string, number>,
  now: number,
): Promise<Outcome> {
  const params: string[] = [];
  const variables: Record<string, string> = {};
  const starts = logins.map((login) => contributionStart(Math.min(joinedAt.get(login.toLowerCase()) ?? now, now)));
  const windows = starts.map((start) => {
    const ranges: { from: number; to: number }[] = [];
    for (let from = start; from <= now; from += 365 * 86_400_000) {
      ranges.push({ from, to: Math.min(from + 365 * 86_400_000 - 1, now) });
    }
    return ranges;
  });
  const fields = logins.map((login, i) => {
    params.push(`$l${i}: String!`);
    variables[`l${i}`] = login;
    const activity = windows[i].map((range, j) => {
      params.push(`$f${i}_${j}: DateTime!`, `$t${i}_${j}: DateTime!`);
      variables[`f${i}_${j}`] = new Date(range.from).toISOString();
      variables[`t${i}_${j}`] = new Date(range.to).toISOString();
      return `activity${j}: contributionsCollection(from: $f${i}_${j}, to: $t${i}_${j}) {
        hasAnyRestrictedContributions
        ${CONTRIBUTION_FIELDS.join(" ")}
        ${CALENDAR_FIELD}
      }`;
    }).join("\n");
    return `u${i}: repositoryOwner(login: $l${i}) { ...Owner ... on User { ${activity} } }`;
  }).join("\n");
  const body = await queryGithub(
    `query(${params.join(", ")}) { ${fields} } ${OWNER_FRAGMENT}`,
    variables,
    token,
    deadline,
  );
  const failed = new Set(
    (body.errors ?? [])
      .filter((e) => e.type !== "NOT_FOUND")
      .map((e) => String(e.path?.[0] ?? "")),
  );
  const results = new Map<string, Lookup>();
  let error: GithubError | undefined;

  await Promise.all(
    logins.map(async (login, i) => {
      const alias = `u${i}`;
      const node = body.data?.[alias];
      let result: Lookup;
      if (failed.has(alias) || failed.has("")) result = { kind: "error" };
      else if (!node) result = { kind: "missing" };
      else if (node.__typename === "Organization")
        result = { kind: "organization" };
      else {
        try {
          const projects = await allProjects(node, token, deadline);
          const starredRepositories = await allStars(node, token, deadline, now);
          const days: string[] = [];
          const totals: Record<(typeof CONTRIBUTION_FIELDS)[number], number> = {
            totalCommitContributions: 0,
            totalIssueContributions: 0,
            totalPullRequestContributions: 0,
            totalPullRequestReviewContributions: 0,
            totalRepositoryContributions: 0,
          };
          for (let j = 0; j < windows[i].length; j++) {
            const contributions = node[`activity${j}`];
            if (!contributions || CONTRIBUTION_FIELDS.some((field) => !Number.isSafeInteger(contributions[field]) || contributions[field] < 0)) {
              throw new GithubError("upstream", "GitHub couldn't load contributions.");
            }
            for (const field of CONTRIBUTION_FIELDS) totals[field] += contributions[field];
            days.push(...calendarDays(contributions));
          }
          const activity = CONTRIBUTION_FIELDS.reduce((sum, field) => sum + totals[field], 0);
          result = {
            kind: "user",
            stats: {
              login: node.login,
              name: node.name ?? null,
              avatarUrl: node.avatarUrl,
              stars: projects.reduce((sum, repo) => sum + repo.stars, 0),
              followers: node.followers?.totalCount ?? 0,
              repos: node.repositories?.totalCount ?? 0,
              activity,
              activitySince: starts[i],
              commits: totals.totalCommitContributions,
              pullRequests: totals.totalPullRequestContributions,
              reviews: totals.totalPullRequestReviewContributions,
              issues: totals.totalIssueContributions,
              activityDays: normalizeDays(days),
              projects,
              starredRepositories,
              starHistoryVersion: 2,
            },
          };
        } catch (err) {
          error ??=
            err instanceof GithubError
              ? err
              : new GithubError(
                  "upstream",
                  "GitHub couldn't load repositories.",
                );
          result = { kind: "error" };
        }
      }
      if (result.kind === "error")
        error ??= new GithubError(
          "upstream",
          "GitHub couldn't load a profile.",
        );
      results.set(login.toLowerCase(), result);
    }),
  );
  return { results, error };
}

export async function lookupMany(logins: string[], joinedAt: ReadonlyMap<string, number> = new Map()): Promise<Outcome> {
  const token = process.env.GITHUB_TOKEN;
  if (!token)
    return {
      results: new Map(),
      error: new GithubError("not_configured", "GITHUB_TOKEN is not set."),
    };
  const batches: string[][] = [];
  for (let i = 0; i < logins.length; i += BATCH_SIZE)
    batches.push(logins.slice(i, i + BATCH_SIZE));
  const results = new Map<string, Lookup>();
  let error: GithubError | undefined;
  const deadline = Date.now() + 35_000;
  const now = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const settled = await Promise.allSettled(
      batches
        .slice(i, i + CONCURRENCY)
        .map((b) => lookupBatch(b, token, deadline, joinedAt, now)),
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        outcome.value.results.forEach((value, key) => results.set(key, value));
        error ??= outcome.value.error;
      } else {
        error ??=
          outcome.reason instanceof GithubError
            ? outcome.reason
            : new GithubError("upstream", "GitHub lookup failed.");
      }
    }
    if (error?.code === "rate_limited" || error?.code === "unauthorized") break;
  }
  return { results, error };
}

export async function lookupOne(login: string, joinedAt = Date.now()): Promise<Lookup> {
  const { results, error } = await lookupMany([login], new Map([[login.toLowerCase(), joinedAt]]));
  const result = results.get(login.toLowerCase());
  if (result && result.kind !== "error") return result;
  if (error) throw error;
  return { kind: "error" };
}
