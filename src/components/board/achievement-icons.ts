import {
  BugMinimalisticIcon,
  CalendarMarkIcon,
  ClipboardCheckIcon,
  CodeIcon,
  CupStarIcon,
  DocumentsIcon,
  FireIcon,
  HandHeartIcon,
  StarIcon,
  UsersGroupRoundedIcon,
} from "@solar-icons/react/bold-duotone";
import type { AchievementId } from "@shared/progression";

/** One icon per achievement, keeping the badge, dialog and portfolio in sync. */
export const ACHIEVEMENT_ICONS: Record<AchievementId, typeof FireIcon> = {
  first_contribution: CupStarIcon,
  prolific_contributor: CodeIcon,
  consistent_20_30: CalendarMarkIcon,
  streak_7: FireIcon,
  streak_30: FireIcon,
  streak_100: FireIcon,
  streak_365: FireIcon,
  first_help: HandHeartIcon,
  community_helper_5: UsersGroupRoundedIcon,
  community_helper_25: UsersGroupRoundedIcon,
  first_review: ClipboardCheckIcon,
  issue_hunter: BugMinimalisticIcon,
  portfolio_author: DocumentsIcon,
  stars_100: StarIcon,
  followers_100: UsersGroupRoundedIcon,
};
