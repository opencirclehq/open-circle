import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BotAdminAction, BotAdminResource } from "@shared/bot-admin";
import type { AdminSession } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { pollApi } from "@/lib/query-policy";
import { useErrorToast } from "@/hooks/use-error-toast";

export const BOT_ADMIN_KEY = ["admin", "bot"];
const denied = (error: unknown) => error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(error.code);
export function useBotAdmin<K extends BotAdminResource>(resource: K, onUnauthorized: () => void, enabled = true) {
  const query = useQuery({ queryKey: [...BOT_ADMIN_KEY, resource], queryFn: ({ signal }) => api.botAdmin(resource, signal), enabled, retry: false, gcTime: 0, refetchInterval: ["groups", "joins"].includes(resource) ? false : pollApi(resource === "status" ? 15_000 : 30_000), refetchIntervalInBackground: false });
  useEffect(() => { if (denied(query.error)) onUnauthorized(); }, [query.error, onUnauthorized]);
  useErrorToast(query.error, "Couldn't load WhatsApp management.", { id: `bot-${resource}`, retry: () => query.refetch() });
  return query;
}

export function useBotAdminActions(onUnauthorized: () => void) {
  const client = useQueryClient();
  const pending = useRef(false);
  const unknownOutcome = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: BotAdminAction) => api.botAdminAction(input),
    retry: false,
    onSuccess: (state) => {
      if (!client.getQueryData<AdminSession>(["admin", "session"])?.profile) return;
      client.setQueryData([...BOT_ADMIN_KEY, "state"], state);
      void client.invalidateQueries({ queryKey: [...BOT_ADMIN_KEY, "status"] });
      void client.invalidateQueries({ queryKey: [...BOT_ADMIN_KEY, "joins"] });
      void client.invalidateQueries({ queryKey: ["admin", "bot-settings"] });
      void client.invalidateQueries({ queryKey: ["participation"] });
      void client.invalidateQueries({ queryKey: ["board"] });
      toast.success("Saved.");
    },
    onError: (error) => {
      if (denied(error)) onUnauthorized();
      if (error instanceof ApiError && (["bot_admin_uncertain", "network"].includes(error.code) || error.status >= 500 && error.code !== "bot_admin_unavailable")) { unknownOutcome.current = true; setNeedsRefresh(true); }
      if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: [...BOT_ADMIN_KEY, "state"] });
      toast.error(error.message);
    },
  });
  return {
    busy: mutation.isPending, needsRefresh,
    refresh: async () => {
      try { await client.refetchQueries({ queryKey: BOT_ADMIN_KEY, type: "active" }, { throwOnError: true }); unknownOutcome.current = false; setNeedsRefresh(false); } catch { return; }
    },
    run: async (input: BotAdminAction) => {
      if (pending.current || unknownOutcome.current) return false;
      pending.current = true;
      try { await mutation.mutateAsync(input); return true; } catch { return false; } finally { pending.current = false; }
    },
  };
}
