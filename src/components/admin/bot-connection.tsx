import { useBotAdmin } from "@/hooks/use-bot-admin";
import { Panel, PanelHeader, Chip } from "@/components/panel";
import { ContentSkeleton } from "@/components/site-skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { BotConfirm, BotItem, type BotActions } from "./bot-controls";
import { BotQueue } from "./bot-queue";

export function BotConnection({ actions, onUnauthorized }: { actions: BotActions; onUnauthorized: () => void }) {
  const status = useBotAdmin("status", onUnauthorized);
  const groups = useBotAdmin("groups", onUnauthorized, false);
  const data = status.data;
  return <div className="space-y-5"><Panel header={<PanelHeader title="Bot connection" chip={data && <Chip tone={data.state === "connected" ? "ok" : "warn"}>{data.state === "connected" ? "Connected" : data.state === "qr_ready" ? "Scan to connect" : data.state === "connecting" ? "Connecting" : "Disconnected"}</Chip>} />}>
    {status.isPending ? <ContentSkeleton label="Loading bot connection…" /> : <div className="space-y-4 py-5">{data && <><p className="break-words text-sm text-t2">{data.account ? `${data.account.name || "Linked phone"}${data.account.phone ? ` · +${data.account.phone}` : ""}` : "Link a dedicated bot phone to check membership and manage the group."}</p><p className="break-all text-xs text-t3">{data.groupJid ? `Configured group: ${data.groupJid}` : "No membership group configured."}</p>{data.state === "qr_ready" && data.qrImage && <div className="w-fit max-w-full rounded-2xl bg-white p-3"><img src={data.qrImage} alt="Scan this QR code in WhatsApp Linked devices to connect the bot phone" className="h-auto max-w-full" width={256} height={256} /></div>}</>}
      <div className="flex flex-wrap gap-2"><TextureButton type="button" variant="minimal" className="min-h-11 w-auto" disabled={status.isFetching || actions.busy} onClick={() => status.refetch()}>{status.isError ? "Retry connection" : "Refresh connection"}</TextureButton>{data && <><BotConfirm label={data.state === "connected" ? "Link another phone" : "Start phone linking"} title="Start linking a bot phone?" description="This disconnects the current phone and starts a new WhatsApp linking session. Membership checks pause until the phone connects." input={() => ({ action: "phone-relink", confirmed: true })} actions={actions} disabled={data.state === "connecting"} /><BotConfirm label="Unlink phone" title="Unlink the bot phone?" description="Membership checks and group automation will pause until a phone is linked again." input={() => ({ action: "phone-unlink", confirmed: true })} actions={actions} disabled={data.state === "disconnected"} /></>}</div>
    </div>}
  </Panel><div className="space-y-3"><TextureButton type="button" variant="minimal" className="min-h-11 w-auto" disabled={groups.isFetching || data?.state !== "connected"} onClick={() => groups.refetch()}>{groups.isFetching ? "Loading groups…" : "Load WhatsApp groups"}</TextureButton>{groups.data && <BotQueue title="WhatsApp groups" items={groups.data} searchText={(group) => `${group.name} ${group.jid}`} empty="No groups found. Add the bot phone to OpenCircle, then load groups again." busy={actions.busy}>{(group) => <BotItem key={group.jid} title={group.name} detail={group.jid} />}</BotQueue>}</div></div>;
}
