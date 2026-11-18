import type { MemberProgression } from "@shared/progression";
import { ApiError } from "./api";

export const progressionApi = {
  member: async (login: string, signal?: AbortSignal): Promise<MemberProgression> => {
    let response: Response;
    try {
      response = await fetch(`/api/progression?login=${encodeURIComponent(login)}`, { cache: "no-store", signal });
    } catch {
      throw new ApiError(0, "network", "You look offline. Check your connection and try again.");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data)
      throw new ApiError(response.status, data?.error?.code ?? "progression_error", data?.error?.message ?? "Couldn't load achievements. Try again.", data?.error?.field);
    return data as MemberProgression;
  },
};
