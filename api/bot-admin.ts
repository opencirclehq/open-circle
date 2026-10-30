import { BOT_ADMIN_RESOURCES, isBotAdminAction, type BotAdminResource } from "../shared/bot-admin.js";
import { authorize } from "../server/admin.js";
import { apiHandler } from "../server/api-security.js";
import { botAdminAction, botAdminRequest } from "../server/bot-admin.js";
import { HttpError, json, readJson } from "../server/http.js";

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };
export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    const resource = new URL(req.url).searchParams.get("resource") ?? "state";
    if (!BOT_ADMIN_RESOURCES.includes(resource as BotAdminResource)) throw new HttpError(400, "invalid_resource", "Choose a WhatsApp management section.");
    return json(await botAdminRequest(resource as BotAdminResource), 200, PRIVATE);
  });
}
export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    const input: unknown = await readJson(req);
    if (!isBotAdminAction(input)) throw new HttpError(400, "invalid_action", "Choose a supported admin action and confirm it when required.");
    return json(await botAdminAction(input), 200, PRIVATE);
  });
}
