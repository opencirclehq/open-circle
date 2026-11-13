export const COMMUNITY_ACTIVITY_POLICY = {
  post: { points: 5, dailyLimit: 2 },
  comment: { points: 2, dailyLimit: 5 },
  like: { points: 1, dailyLimit: 10 },
  vote: { points: 1, dailyLimit: 5 },
  commentsPerThread: 2,
  minimumCommentLength: 15,
} as const;

export type CommunityActivityKind = "post" | "comment" | "like" | "vote";
export interface CommunityActivity {
  kind: CommunityActivityKind;
  actorId: number;
  targetId: string;
  threadId: string;
  at: number | null;
  fingerprint?: string;
  active?: boolean;
}
export interface CommunityActivityScore {
  points: number;
  posts: number;
  comments: number;
  likes: number;
  votes: number;
}

export const emptyCommunityActivity = (): CommunityActivityScore => ({ points: 0, posts: 0, comments: 0, likes: 0, votes: 0 });
