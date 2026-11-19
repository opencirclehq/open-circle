import { apiHandler } from "../server/api-security.js";
import { componentScreenshot, componentShareCard } from "../server/component-seo.js";
import { shareImage } from "../server/forum-image.js";
import { HttpError } from "../server/http.js";

export function GET(req: Request) {
  return apiHandler(req, async () => {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const preview = componentShareCard(slug);
    if (!preview) throw new HttpError(404, "component_missing", "This component is unavailable.");
    // A real picture of the component when one has been captured; the text card otherwise.
    const bytes = await componentScreenshot(slug) ?? await shareImage(preview.key, preview.card);
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "public, max-age=300",
      "content-disposition": "inline", "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "cross-origin",
    } });
  });
}

export async function HEAD(req: Request) {
  const response = await GET(req);
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}
