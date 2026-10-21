export const ANALYTICS_PAGES = {
  "/": "Leaderboard",
  "/repositories": "Spotlight",
  "/tools": "Tools",
  "/participation": "Participation",
  "/how-it-works": "How it works",
  "/blog": "Blog",
} as const;

export type AnalyticsPage = keyof typeof ANALYTICS_PAGES;
export type AnalyticsDays = 7 | 30 | 90;

export interface TrafficDay {
  date: string;
  visitors: number;
  pageViews: number;
}

export interface TrafficPeriod {
  visitors: number;
  pageViews: number;
  returningVisitors: number;
  daily: TrafficDay[];
  pages: { name: string; views: number }[];
  sources: { name: string; views: number }[];
}

export interface AdminAnalytics {
  days: AnalyticsDays;
  startedAt: number | null;
  generatedAt: number;
  current: TrafficPeriod;
  previous: TrafficPeriod | null;
  growth: {
    members: number;
    previousMembers: number;
    toolSubmissions: number;
    previousToolSubmissions: number;
    pendingTools: number;
  };
}
