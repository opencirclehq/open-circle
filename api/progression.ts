import { apiHandler } from "../server/api-security.js";
import { readProgression } from "../server/board.js";
import { getStore } from "../server/db.js";
import { HttpError, json } from "../server/http.js";
import { clientKey } from "../server/rate-limit.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const login = (new URL(req.url).searchParams.get("login") ?? "").trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(login))
      throw new HttpError(400, "invalid_login", "That GitHub username doesn't look right.");
    const store = getStore();
    if (!(await store.rateLimit(`progression:ip:${clientKey(req)}`, 120, 60)))
      throw new HttpError(429, "progression_rate", "Too many requests. Wait a moment and try again.", undefined, { "retry-after": "60" });
    const data = await readProgression(store, login);
    if (!data) throw new HttpError(404, "progression_missing", "This developer isn't on the board.");
    return json(data, 200, { "cache-control": "public, max-age=60" });
  });
}
