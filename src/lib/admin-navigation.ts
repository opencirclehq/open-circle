import type { CoordinationAdminState } from "@shared/coordination";

export const ADMIN_GROUPS = [
  { label: "Website", sections: [["overview", "Overview"], ["members", "Members"], ["tools", "Tools"], ["events", "Events"], ["community", "Community"], ["blog", "Blog"]] },
  { label: "WhatsApp", sections: [["repositories", "Repositories"], ["projects", "Projects"], ["feedback", "Feedback"], ["bot-members", "Group members"], ["reviews", "Member reviews"], ["joins", "Join requests"], ["group", "Group & updates"], ["deliveries", "Deliveries"], ["connection", "Connection"], ["history", "Activity history"]] },
  { label: "Configuration", sections: [["settings", "Settings"]] },
] as const;
export type AdminSection = typeof ADMIN_GROUPS[number]["sections"][number][0];
export type BotSection = Exclude<AdminSection, "overview" | "members" | "tools" | "events" | "community" | "blog" | "settings">;
export const ADMIN_SECTIONS = ADMIN_GROUPS.flatMap((group) => [...group.sections]);
export const isAdminSection = (value: string | null): value is AdminSection => ADMIN_SECTIONS.some(([id]) => id === value);
export function botPending(data?: CoordinationAdminState) {
  return {
    repositories: data?.community?.repositories.filter((repo) => repo.status === "pending").length,
    projects: data?.projects.filter((project) => project.status === "pending").length,
    feedback: data?.contributions.filter((entry) => entry.status === "pending").length,
    "bot-members": data?.members.filter((member) => member.awayRequestedDays !== null).length,
    reviews: data ? data.cases.length + (data.engagement?.weeks.reduce((sum, week) => sum + week.members.filter((member) => member.removal === "uncertain").length, 0) ?? 0) : undefined,
    deliveries: data ? data.outbox.length + (data.community?.repositories.filter((repo) => repo.pinStatus === "uncertain").length ?? 0) : undefined,
  };
}
