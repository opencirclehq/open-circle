import { useEffect, useRef, useState } from "react";
import type { BlogEmbed } from "@shared/blog";

const external = { target: "_blank", rel: "noopener noreferrer nofollow ugc" } as const;

/**
 * GitHub's Gist embed is a script that writes into its page, so it runs in a
 * sandboxed frame with no access to this site. The frame only reports its height.
 */
function GistEmbed({ user, id, title, href }: { user: string; id: string; title: string; href: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      const value = (event.data as { gistHeight?: unknown }).gistHeight;
      if (typeof value === "number" && Number.isFinite(value)) setHeight(Math.min(4000, Math.max(60, Math.ceil(value))));
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);
  // `user` and `id` are validated to letters, digits and hyphens before they reach here.
  const page = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:transparent}.gist .gist-file{margin:0!important}</style></head><body><script src="https://gist.github.com/${user}/${id}.js"></script><script>const send=()=>parent.postMessage({gistHeight:document.documentElement.scrollHeight},"*");new ResizeObserver(send).observe(document.body);addEventListener("load",send);</script></body></html>`;
  return <figure className="blog-embed">
    <iframe ref={frame} className="blog-embed-gist" title={title} srcDoc={page} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="lazy" style={height ? { height } : undefined} />
    <figcaption><a href={href} {...external}>View this Gist on GitHub</a></figcaption>
  </figure>;
}

export function BlogEmbedView({ embed, title, href }: { embed: BlogEmbed; title: string; href: string }) {
  const named = title && title !== href ? title : null;
  if (embed.kind === "gist") return <GistEmbed user={embed.user} id={embed.id} title={named ?? `GitHub Gist by ${embed.user}`} href={href} />;
  return <figure className="blog-embed">
    <div className="blog-embed-video">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${embed.id}${embed.start ? `?start=${embed.start}` : ""}`}
        title={named ?? "YouTube video"}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
    <figcaption><a href={href} {...external}>Watch on YouTube</a></figcaption>
  </figure>;
}
