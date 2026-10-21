import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement as h, type CSSProperties } from "react";
import satori from "satori";
import { renderAsync } from "@resvg/resvg-js";
import type { ForumSharePreview } from "../shared/forum-seo.js";

const images = new Map<string, Promise<Buffer>>();
let fonts: Promise<Buffer[]> | undefined;
let logo: Promise<string> | undefined;
const text = (value: string, style: CSSProperties) => h("div", { style }, value);

/** The text on a 1200×630 link-preview card. */
export interface ShareCard { label: string; title: string; description: string; author: string; category: string }

export function forumImage(preview: ForumSharePreview): Promise<Buffer> {
  return shareImage(`${preview.id}:${preview.version}`, { label: preview.kind === "question" ? "Question" : "Discussion", title: preview.title, description: preview.description, author: preview.author, category: preview.category });
}

/** Renders once per key; the few most recent cards stay cached. */
export function shareImage(key: string, card: ShareCard): Promise<Buffer> {
  const cached = images.get(key);
  if (cached) return cached;
  const image = render(card).catch(error => { images.delete(key); throw error; });
  images.set(key, image);
  if (images.size > 24) images.delete(images.keys().next().value!);
  return image;
}

async function render(preview: ShareCard) {
  fonts ??= Promise.all([400, 600].map(weight => readFile(path.resolve(`public/fonts/Aspekta-${weight}.ttf`)))).catch(error => { fonts = undefined; throw error; });
  logo ??= readFile(path.resolve("public/favicon.svg")).then(bytes => `data:image/svg+xml;base64,${bytes.toString("base64")}`).catch(error => { logo = undefined; throw error; });
  const [[regular, semibold], logoData] = await Promise.all([fonts, logo]);
  const svg = await satori(h("div", { style: {
    width: 1200, height: 630, position: "relative", display: "flex",
    backgroundColor: "#04060a", color: "#f4f7fb", fontFamily: "Aspekta",
  } },
  h("div", { style: { position: "absolute", top: 52, left: 64, width: 1072, height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" } },
    h("div", { style: { width: 320, height: 48, display: "flex", alignItems: "center", gap: 16 } }, h("img", { src: logoData, width: 48, height: 48 }), text("OpenCircle", { fontSize: 30, fontWeight: 600, letterSpacing: -1 })),
    text(preview.label, { fontSize: 24, color: "#a5afbf" }),
  ),
  h("div", { style: { position: "absolute", top: 162, left: 64, width: 1072, height: 320, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 } },
    text(preview.title, { width: 1072, fontSize: preview.title.length > 105 ? 48 : preview.title.length > 65 ? 56 : 64, fontWeight: 600, lineHeight: 1.12, letterSpacing: -2, wordBreak: "break-word", lineClamp: 3, textOverflow: "ellipsis" } as CSSProperties),
    text(preview.description, { width: 1072, fontSize: 27, lineHeight: 1.4, color: "#b4bfce", lineClamp: 2, textOverflow: "ellipsis", wordBreak: "break-word" } as CSSProperties),
  ),
  h("div", { style: { position: "absolute", bottom: 52, left: 64, width: 1072, height: 44, display: "flex", alignItems: "center", gap: 24, fontSize: 22, color: "#a5afbf" } },
    text(preview.author, { maxWidth: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }), text(preview.category, {}), text("opencircle.cc", { marginLeft: "auto" }),
  )), {
    width: 1200, height: 630,
    fonts: [{ name: "Aspekta", data: regular, weight: 400, style: "normal" }, { name: "Aspekta", data: semibold, weight: 600, style: "normal" }],
  });
  return (await renderAsync(svg, { font: { loadSystemFonts: false } })).asPng();
}
