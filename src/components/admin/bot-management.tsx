import type { CoordinationAdminState } from "@shared/coordination";
import type { BotSection } from "@/lib/admin-navigation";
import { BotRepositories, BotProjects, BotFeedback } from "./bot-submissions";
import { BotMembers, BotReviews } from "./bot-members";
import { BotDeliveries } from "./bot-deliveries";
import { BotGroup } from "./bot-group";
import { BotJoins } from "./bot-joins";
import { BotConnection } from "./bot-connection";
import { BotItem, type BotActions } from "./bot-controls";
import { BotQueue } from "./bot-queue";

export default function BotManagement({ section, data, actions, onUnauthorized, settings }: { section: BotSection; data: CoordinationAdminState; actions: BotActions; onUnauthorized: () => void; settings: () => void }) {
  switch (section) {
    case "repositories": return <BotRepositories data={data} actions={actions} />;
    case "projects": return <BotProjects data={data} actions={actions} />;
    case "feedback": return <BotFeedback data={data} actions={actions} />;
    case "bot-members": return <BotMembers data={data} actions={actions} />;
    case "reviews": return <BotReviews data={data} actions={actions} />;
    case "deliveries": return <BotDeliveries data={data} actions={actions} />;
    case "group": return <BotGroup data={data} actions={actions} settings={settings} />;
    case "joins": return <BotJoins data={data} actions={actions} onUnauthorized={onUnauthorized} />;
    case "connection": return <BotConnection actions={actions} onUnauthorized={onUnauthorized} />;
    case "history": return <BotQueue title="Activity history" items={data.audit} searchText={(entry) => `${entry.action} ${entry.detail}`} empty="No bot admin actions recorded yet." busy={actions.busy}>{(entry) => <BotItem key={`${entry.at}:${entry.action}:${entry.detail}`} title={entry.action.replace(/-/g, " ")} detail={`${new Date(entry.at).toLocaleString("en")} · ${entry.detail}`} />}</BotQueue>;
  }
}
