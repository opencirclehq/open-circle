import type { CoordinationAdminState } from "../../shared/coordination";

export function botAdminFixture(queues = false): CoordinationAdminState {
  const now = 1793350800000;
  return {
    policy: { enabled: true, timezone: "Africa/Lagos", welcomeTimes: ["09:00", "14:00", "19:00"], quietStart: 22, quietEnd: 8, graceDays: 14, target: 4, reviewPeers: 2, periodDays: 28, reminderDays: 14, warningDays: 21, removalDays: 28 },
    tracking: true, botAdmin: true, announced: true,
    members: queues ? [{ id: "member_1", name: "Alice", contact: "+15550000001", active: true, welcomePending: false, warnings: [14, 21], linked: true, login: "Alice", enabled: true, tracking: true, contributions: 1, reviewPeers: 1, target: 4, requiredReviewPeers: 2, inactiveDays: 28, graceRemainingDays: 0, awayUntil: null, awayRequestedDays: 7, pendingContributions: 0, removalReview: true }] : [],
    projects: queues ? [{ id: "project_1", owner: "Alice", title: "Community search", url: "https://github.com/Alice/search", createdAt: now, status: "pending", reviews: 0, assignedTo: [] }] : [],
    help: queues ? [{ id: "help_1", owner: "Alice", question: "How can I improve keyboard navigation?", createdAt: now, status: "open" }] : [],
    contributions: queues ? [{ id: "feedback_1", by: "Bob", for: "Alice", kind: "review", targetId: "project_1", text: "I tested keyboard navigation and fixed the search focus.", status: "pending", createdAt: now }] : [],
    cases: queues ? [{ id: "case_1", memberId: "member_1", member: "Alice", reason: "Inactive for 28 tracked days", kind: "inactive", status: "pending", eligible: false, blockedReason: "Resolve the break request first." }] : [],
    outbox: queues ? [{ id: "delivery_1", status: "uncertain", kind: "digest", recipient: "Alice", text: "Please share your progress this week.", createdAt: now, error: null }] : [],
    audit: queues ? [{ at: now, action: "repository-submitted", detail: "Alice/tool" }] : [],
    community: {
      settings: { groupSchedule: false, summariesEnabled: false, mentorMatching: false, sessionsEnabled: false, summaryTime: "19:00", announcementsJid: "", mentorWaitHours: 24, helpDay: 3, helpTime: "18:00", demoDay: 5, demoTime: "18:00", sessionMinutes: 60, repositoriesEnabled: false, pinRepositories: false, weeklyBoardEnabled: false },
      repositories: queues ? [{ id: "repo_1", owner: "Alice", fullName: "Alice/tool", url: "https://github.com/Alice/tool", license: "MIT", fork: false, summary: "A useful tool for the community.", helpWanted: "Help test the keyboard shortcuts.", issues: ["https://github.com/Alice/tool/issues/1"], skills: ["typescript"], tagOwner: true, status: "pending", reason: "", needsHelp: true, createdAt: now, checkedAt: now, announcedAt: null, followedUpAt: null, pinStatus: "idle" }] : [],
      groupControl: { overrideOpen: null, overrideUntil: null, status: "idle", error: null, observedOpen: false },
      updates: [], sessions: [], mentors: [], metrics: { newLinkedMembers: 0, firstContributors: 0, confirmedContributions: 0, openQuestions: 0, resolvedQuestions: 0, projectsWithFeedback: 0 },
    },
  };
}
