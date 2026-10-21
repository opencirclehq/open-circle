import { apiHandler } from "../server/api-security.js";
import { BLOG_PRIVATE_HEADERS, blogAdmin, commandBlog, queueBlog, readDraft } from "../server/blog.js";
import { getBlogStore } from "../server/blog-store.js";
import { json, readJson } from "../server/http.js";
import { BLOG_MAX_BYTES } from "../shared/blog.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const viewer = await blogAdmin(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    return json(id ? await readDraft(getBlogStore(), viewer, id) : await queueBlog(getBlogStore(), url), 200, BLOG_PRIVATE_HEADERS);
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const viewer = await blogAdmin(req);
    return json(await commandBlog(getBlogStore(), viewer, await readJson(req, BLOG_MAX_BYTES)), 200, BLOG_PRIVATE_HEADERS);
  });
}
