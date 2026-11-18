import { createElement as h } from "react";
import type { Board } from "../shared/types.js";
import { cachedImage, cardAssets, renderCard, text } from "./forum-image.js";

const GOLD = "#f4c556";
const MUTED = "#9a9ca3";
const AVATAR_HOST = "avatars.githubusercontent.com";
const AVATAR_MAX_BYTES = 512 * 1024;

export interface PodiumSeat { rank: 1 | 2 | 3; name: string; login: string; score: number; avatarUrl: string }
export interface HomeCard { seats: PodiumSeat[] }

/** The top three members and the size of the circle, as the card shows them. */
export function homeCard(board: Pick<Board, "members">): HomeCard {
  const seats = board.members
    .filter((member): member is typeof member & { rank: 1 | 2 | 3 } => member.rank >= 1 && member.rank <= 3)
    .sort((a, b) => a.rank - b.rank)
    .map((member) => ({ rank: member.rank, name: member.nickname, login: member.login, score: member.score, avatarUrl: member.avatarUrl }));
  return { seats };
}

export const homeCardKey = (card: HomeCard) => `home:${card.seats.map((seat) => `${seat.login}=${seat.score}`).join(",")}`;

/** Satori cannot fetch pictures, so avatars are read here and embedded. Anything but a small GitHub avatar is skipped. */
async function avatarData(url: string): Promise<string | null> {
  try {
    const source = new URL(url);
    if (source.protocol !== "https:" || source.hostname !== AVATAR_HOST) return null;
    source.searchParams.set("s", "160");
    const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(3000) });
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || (type !== "image/png" && type !== "image/jpeg")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= AVATAR_MAX_BYTES ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch { return null; }
}

const svg = (markup: string) => `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
const GITHUB_MARK = svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#fff" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>');
const CROWN = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><path fill="${GOLD}" d="M2 8l9 7 9-13 9 13 9-7-3 17H5z"/><rect x="5" y="26" width="30" height="4" rx="1" fill="${GOLD}"/></svg>`);

/** Column heights, so first place stands tallest. */
const COLUMN = { 1: 300, 2: 210, 3: 150 } as const;
const ORDER = [2, 1, 3] as const;
const AVATAR = 62;

function seat(entry: PodiumSeat | undefined, rank: 1 | 2 | 3, avatar: string | null) {
  const picture = avatar
    ? h("img", { src: avatar, width: AVATAR, height: AVATAR, style: { borderRadius: 999 } })
    : h("div", { style: { width: AVATAR, height: AVATAR, borderRadius: 999, background: "linear-gradient(180deg, #d9dade, #8f9097)" } });
  return h("div", { key: rank, style: { display: "flex", flexDirection: "column", alignItems: "center", width: 150 } },
    rank === 1 && h("img", { src: CROWN, width: 40, height: 30, style: { marginBottom: 8 } }),
    picture,
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", height: 58, marginTop: 10, marginBottom: 14 } },
      text(entry?.name ?? "Open seat", { maxWidth: 150, fontSize: 20, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: entry ? "#f4f4f5" : MUTED }),
      entry && text(`${entry.score.toLocaleString("en-US")} pts`, { marginTop: 2, fontSize: 18, color: MUTED })),
    h("div", { style: {
      display: "flex", justifyContent: "center", width: 150, height: COLUMN[rank], paddingTop: 24,
      borderRadius: "22px 22px 0 0", background: "linear-gradient(180deg, #f5f5f6 0%, #dcdcdf 40%, #0a0a0c 100%)",
      fontSize: 40, fontWeight: 600, color: "#9d9da3",
    } }, String(rank)));
}

/** The home page's share card: the headline on the left, the current top three on a podium. */
export function homeImage(card: HomeCard): Promise<Buffer> {
  return cachedImage(homeCardKey(card), async () => {
    const [assets, avatars] = await Promise.all([cardAssets(), Promise.all(card.seats.map((entry) => avatarData(entry.avatarUrl)))]);
    const avatarFor = (rank: number) => avatars[card.seats.findIndex((entry) => entry.rank === rank)] ?? null;
    return renderCard(
      h("div", { style: { width: 1200, height: 630, position: "relative", display: "flex", background: "linear-gradient(135deg, #1b1c20 0%, #0a0a0c 55%, #050506 100%)", color: "#f4f4f5", fontFamily: "Aspekta" } },
        h("div", { style: { position: "absolute", left: 80, top: 112, display: "flex", flexDirection: "column", fontSize: 62, fontWeight: 400, lineHeight: 1.1, letterSpacing: -2.5 } },
          text("Paste your username.", {}), text("Take your place.", { color: "#8d8f96" })),
        h("div", { style: { position: "absolute", left: 80, top: 287, width: 222, height: 70, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 999, border: "2px solid rgba(255,255,255,0.4)", background: "linear-gradient(180deg, #26272b, #0d0e10)", fontSize: 24, fontWeight: 600 } },
          h("img", { src: GITHUB_MARK, width: 26, height: 26 }), text("Get ranked", {})),
        text("OpenCircle", { position: "absolute", left: 80, bottom: 70, fontSize: 40, fontWeight: 600, letterSpacing: -1.5, color: "#d6d8dd" }),
        h("div", { style: { position: "absolute", left: 642, bottom: 0, display: "flex", alignItems: "flex-end", gap: 14 } },
          ORDER.map((rank) => seat(card.seats.find((entry) => entry.rank === rank), rank, avatarFor(rank)))),
      ),
      assets,
    );
  });
}
