import type { CoordinationAdminState } from "@shared/coordination";
import { useBotAdmin } from "@/hooks/use-bot-admin";
import { TextureButton } from "@/components/ui/texture-button";
import { ContentSkeleton } from "@/components/site-skeleton";
import { BotButton, BotConfirm, BotItem, type BotActions } from "./bot-controls";
import { BotQueue } from "./bot-queue";

export function BotJoins({ data, actions, onUnauthorized }: { data: CoordinationAdminState; actions: BotActions; onUnauthorized: () => void }) {
  const joins = useBotAdmin("joins", onUnauthorized, data.botAdmin);
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><BotConfirm label="Require join approval" title="Require approval for new joins?" description="New group join requests will need an admin decision in WhatsApp." input={() => ({ action: "join-approvals", enabled: true, confirmed: true })} actions={actions} disabled={!data.botAdmin} /><BotConfirm label="Allow direct joins" title="Allow members to join directly?" description="New members can join using the group invite without an approval decision." input={() => ({ action: "join-approvals", enabled: false, confirmed: true })} actions={actions} disabled={!data.botAdmin} /></div>
    {!data.botAdmin ? <p className="text-sm text-t3">The bot needs group admin rights to load or review join requests.</p> : joins.isPending ? <ContentSkeleton label="Loading join requests…" /> : joins.isError && !joins.data ? <TextureButton type="button" variant="minimal" className="min-h-11 w-auto" onClick={() => joins.refetch()}>Retry join requests</TextureButton> : <BotQueue title="Join requests" items={joins.data ?? []} searchText={(entry) => entry.jid} empty="No pending join requests." busy={actions.busy} toolbar={<div className="pt-4"><TextureButton type="button" variant="minimal" className="min-h-11 w-auto" disabled={joins.isFetching || actions.busy} onClick={() => joins.refetch()}>Refresh join requests</TextureButton></div>}>{(entry) => <BotItem key={entry.jid} title={entry.jid} detail="Pending join request"><div className="flex flex-wrap gap-2"><BotButton input={{ action: "join", id: entry.jid, approve: true }} actions={actions}>Approve join</BotButton><BotButton input={{ action: "join", id: entry.jid, approve: false }} actions={actions}>Reject join</BotButton></div></BotItem>}</BotQueue>}
  </div>;
}
