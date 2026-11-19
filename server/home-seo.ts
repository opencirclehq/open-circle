import { DEFAULT_SITE_URL } from "../shared/brand.js";
import { PODIUM_PATHS, podiumImage } from "../shared/podium-seo.js";
import { seoDocument, type SeoDocument } from "../shared/seo.js";
import { shareImageVersion } from "../shared/share-image.js";
import { getStore } from "./db.js";
import { HttpError } from "./http.js";
import { homeCard, homeCardKey } from "./home-image.js";

/** Reads the saved board only: a share card must never wait on, or trigger, a GitHub refresh. */
export async function readHomeCard() {
  const board = await getStore().getBoard();
  if (!board) throw new HttpError(503, "board_unavailable", "The leaderboard isn't ready yet.");
  return homeCard(board);
}

/** Home and the community page share the live podium. Without a board to read they keep the static card. */
export async function homeSeoDocument(pathname: string, origin = DEFAULT_SITE_URL): Promise<SeoDocument | null> {
  if (!PODIUM_PATHS.has(pathname)) return null;
  try {
    const card = await readHomeCard();
    const document = seoDocument(pathname, origin);
    return {
      ...document,
      image: podiumImage(
        document.url,
        shareImageVersion(homeCardKey(card)),
        card.seats.length ? `OpenCircle leaderboard: ${card.seats.map((seat) => `${seat.rank}. ${seat.name}`).join(", ")}` : undefined,
      ),
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
