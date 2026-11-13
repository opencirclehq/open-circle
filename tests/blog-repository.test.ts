import { afterEach, expect, it, vi } from "vitest";
import { verifyRepository } from "../server/blog-repository";

const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("confirms a public GitHub repository and keeps GitHub's own name for it", async () => {
  const fetch = respond(200, { full_name: "OpenCircleHQ/open-circle", html_url: "https://github.com/OpenCircleHQ/open-circle", private: false });
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  await expect(verifyRepository({ provider: "github", fullName: "opencirclehq/open-circle", url: "https://github.com/opencirclehq/open-circle" }))
    .resolves.toEqual({ provider: "github", fullName: "OpenCircleHQ/open-circle", url: "https://github.com/OpenCircleHQ/open-circle" });
  expect(fetch.mock.calls[0][0]).toBe("https://api.github.com/repos/opencirclehq/open-circle");
  expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer test-token");
});

it("confirms public GitLab projects and Bitbucket repositories", async () => {
  vi.stubGlobal("fetch", respond(200, { path_with_namespace: "group/sub/project", web_url: "https://gitlab.com/group/sub/project", visibility: "public" }));
  await expect(verifyRepository({ provider: "gitlab", fullName: "group/sub/project", url: "https://gitlab.com/group/sub/project" })).resolves.toMatchObject({ fullName: "group/sub/project" });
  vi.stubGlobal("fetch", respond(200, { full_name: "workspace/repo", is_private: false, links: { html: { href: "https://bitbucket.org/workspace/repo" } } }));
  await expect(verifyRepository({ provider: "bitbucket", fullName: "workspace/repo", url: "https://bitbucket.org/workspace/repo" })).resolves.toMatchObject({ fullName: "workspace/repo" });
});

it("refuses repositories that are missing, private or reported on another host", async () => {
  const github = { provider: "github" as const, fullName: "owner/project", url: "https://github.com/owner/project" };
  vi.stubGlobal("fetch", respond(404, { message: "Not Found" }));
  await expect(verifyRepository(github)).rejects.toMatchObject({ status: 400, code: "blog_repository_missing", field: "repository" });
  vi.stubGlobal("fetch", respond(200, { full_name: "owner/project", html_url: "https://github.com/owner/project", private: true }));
  await expect(verifyRepository(github)).rejects.toMatchObject({ code: "blog_repository_missing" });
  vi.stubGlobal("fetch", respond(200, { full_name: "owner/project", html_url: "https://evil.test/owner/project", private: false }));
  await expect(verifyRepository(github)).rejects.toMatchObject({ code: "blog_repository_missing" });
  vi.stubGlobal("fetch", respond(200, { path_with_namespace: "group/project", web_url: "https://gitlab.com/group/project", visibility: "internal" }));
  await expect(verifyRepository({ provider: "gitlab", fullName: "group/project", url: "https://gitlab.com/group/project" })).rejects.toMatchObject({ code: "blog_repository_missing" });
});

it("blocks rather than accepting an unchecked repository when the host can't be reached", async () => {
  const github = { provider: "github" as const, fullName: "owner/project", url: "https://github.com/owner/project" };
  vi.stubGlobal("fetch", respond(503, {}));
  await expect(verifyRepository(github)).rejects.toMatchObject({ status: 503, code: "blog_repository_unavailable" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  await expect(verifyRepository(github)).rejects.toMatchObject({ status: 503, code: "blog_repository_unavailable" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
  await expect(verifyRepository(github)).rejects.toMatchObject({ status: 503 });
});
