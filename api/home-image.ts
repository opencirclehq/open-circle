import { apiHandler } from "../server/api-security.js";
import { homeImage } from "../server/home-image.js";
import { readHomeCard } from "../server/home-seo.js";

export function GET(req: Request) {
  return apiHandler(req, async () => {
    const bytes = await homeImage(await readHomeCard());
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
