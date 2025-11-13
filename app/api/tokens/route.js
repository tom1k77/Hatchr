// app/api/tokens/route.js
import { NextResponse } from "next/server";
import {
  fetchZoraLatest,
  fetchClankerRecent,
  normalizeZora,
  normalizeClanker,
  dedupeMerge,
  enrichDexScreener,
  getContractCreator,
  scrapeSocialsFromSource,
  resolveFarcasterForCreator,
} from "../../../lib/providers";

const S_MAX_AGE = 120;
const STALE_WHILE_REVALIDATE = 60;

export async function GET() {
  try {
    const [zoraJson, clankerJson] = await Promise.all([
      fetchZoraLatest(),
      fetchClankerRecent(),
    ]);

    const zora = normalizeZora(zoraJson);
    const clanker = normalizeClanker(clankerJson);

    const merged = dedupeMerge(zora, clanker);

    for (const t of merged) {
      if (!t.source_url) continue;
      const socials = await scrapeSocialsFromSource(t.source_url);
      Object.assign(t, socials);
    }

    const withMarket = await enrichDexScreener(merged);

    for (const t of withMarket) {
      try {
        const creator = await getContractCreator(t.token_address);
        if (creator) {
          t.creator_address = creator.toLowerCase();
          const fc = await resolveFarcasterForCreator({
            creatorAddress: t.creator_address,
            farcasterUrlFromSource: t.farcaster_url,
          });
          if (fc?.fid) {
            t.creator_fid = fc.fid;
            t.creator_username = fc.username;
          }
        }
      } catch (_) {
        // пропускаем ошибку для конкретного токена
      }
    }

    return new NextResponse(
      JSON.stringify({ count: withMarket.length, items: withMarket }),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, s-maxage=${S_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  } catch (e) {
    return new NextResponse(
      JSON.stringify({ error: e?.message || "failed" }),
      { status: 500 }
    );
  }
}
