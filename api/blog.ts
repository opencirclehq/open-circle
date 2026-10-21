import { apiHandler } from "../server/api-security.js";
import { BLOG_PRIVATE_HEADERS, BLOG_PUBLIC_HEADERS, blogMember, commandBlog, listBlog, myBlog, readBlog, readDraft } from "../server/blog.js";
import { getBlogStore } from "../server/blog-store.js";
import { requireSameOriginJson } from "../server/community.js";
import { conditionalJson, json, readJson } from "../server/http.js";
import { BLOG_MAX_BYTES } from "../shared/blog.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id || url.searchParams.get("mine") === "1") {
      const viewer = await blogMember(req);
      return json(id ? await readDraft(getBlogStore(), viewer, id) : await myBlog(getBlogStore(), viewer), 200, BLOG_PRIVATE_HEADERS);
    }
    const slug = url.searchParams.get("slug");
    return conditionalJson(req, slug ? await readBlog(getBlogStore(), slug) : await listBlog(getBlogStore(), url), BLOG_PUBLIC_HEADERS);
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requireSameOriginJson(req);
    const viewer = await blogMember(req);
    return json(await commandBlog(getBlogStore(), viewer, await readJson(req, BLOG_MAX_BYTES)), 200, BLOG_PRIVATE_HEADERS);
  });
}
