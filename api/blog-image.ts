import { apiHandler } from "../server/api-security.js";
import { shareImage } from "../server/forum-image.js";
import { blogShareCard } from "../server/blog-seo.js";
import { HttpError } from "../server/http.js";

export function GET(req: Request) {
  return apiHandler(req, async () => {
    const preview = await blogShareCard(new URL(req.url).searchParams.get("slug") ?? "");
    if (!preview) throw new HttpError(404, "blog_missing", "This blog post is unavailable.");
    const bytes = await shareImage(preview.key, preview.card);
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
