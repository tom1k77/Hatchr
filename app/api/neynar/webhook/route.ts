import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

// --- signature ---
function verifyNeynarSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.NEYNAR_WEBHOOK_SECRET;
  if (!secret) throw new Error("NEYNAR_WEBHOOK_SECRET is not set");
  if (!signatureHeader) throw new Error("X-Neynar-Signature missing");

  const hmac = createHmac("sha512", secret);
  hmac.update(rawBody);
  const expectedHex = hmac.digest("hex");

  // timing-safe compare in HEX
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(signatureHeader, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- parsing ---
function extractTickers(text: string) {
  const re = /\$[A-Za-z0-9_]{2,12}\b/g;
  const matches = text.match(re) ?? [];
  const uniq = [...new Set(matches.map((t) => t.toUpperCase()))];
  return uniq;
}

function extractContracts(text: string) {
  const re = /\b0x[a-fA-F0-9]{40}\b/g;
  const matches = text.match(re) ?? [];
  const uniq = [...new Set(matches)];
  return uniq.map((x) => x.toLowerCase());
}

function toWarpcastUrl(username?: string, castHash?: string) {
  if (!username || !castHash) return null;
  return `https://warpcast.com/${username}/${castHash.slice(0, 8)}`;
}

function hasLink(text: string) {
  return /(https?:\/\/|warpcast\.com|zora\.co|basescan\.org|base\.org|github\.com|mirror\.xyz)/i.test(text);
}

const EVENT_WORDS = [
  "airdrop",
  "claim",
  "snapshot",
  "listing",
  "listed",
  "audit",
  "exploit",
  "hack",
  "mainnet",
  "testnet",
  "launch",
  "partnership",
  "integration",
  "bridge",
  "migration",
  "tokenomics",
  "incident",
  "security",
];

const BANTER_WORDS = [
  "gm",
  "gn",
  "wen",
  "lol",
  "lmao",
  "ape",
  "pump",
  "send",
  "moon",
  "ngmi",
  "wagmi",
];

function hasEventWords(text: string) {
  const t = text.toLowerCase();
  return EVENT_WORDS.some((w) => t.includes(w));
}

function isBanter(text: string) {
  const t = text.toLowerCase();
  // если короткий текст и состоит из бантер-слов — режем
  const banterHits = BANTER_WORDS.filter((w) => t.includes(w)).length;
  return t.length < 140 && banterHits >= 1;
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const sig = req.headers.get("X-Neynar-Signature");
  const ok = verifyNeynarSignature(rawBody, sig);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const cast = payload?.data?.cast ?? payload?.cast ?? payload?.data ?? payload;
  const author = cast?.author ?? payload?.data?.author ?? null;

  const text: string = cast?.text ?? "";
  const castHash: string | undefined = cast?.hash ?? cast?.cast_hash;
  const timestamp = cast?.timestamp ?? cast?.created_at ?? null;

  if (!castHash) return NextResponse.json({ ok: true, skipped: "no_cast_hash" });

  const authorScore: number | null = typeof author?.score === "number" ? author.score : null;
  const minScore = Number(process.env.NEYNAR_MIN_SCORE ?? "0.7");
  if (authorScore == null || authorScore < minScore) {
    return NextResponse.json({ ok: true, skipped: "low_score" });
  }

  // базовые извлечения
  const tickers = extractTickers(text);
  const contracts = extractContracts(text);

  if (tickers.length === 0 && contracts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no_token_mentions" });
  }

  // анти-спам: если пост перечисляет кучу тикеров — это почти всегда шум
  if (tickers.length > 5) {
    return NextResponse.json({ ok: true, skipped: "too_many_tickers" });
  }

  // бантер-фильтр
  if (isBanter(text)) {
    return NextResponse.json({ ok: true, skipped: "banter" });
  }

  // “полезный сигнал” = (есть ссылка) ИЛИ (есть event-слова)
  // иначе — режем мусор
  if (!hasLink(text) && !hasEventWords(text)) {
    return NextResponse.json({ ok: true, skipped: "no_event_signal" });
  }

  // --- cooldowns (уменьшает шум/повторы) ---
  // per-author: 2 minutes
  const authorFid = author?.fid ?? null;
  if (authorFid != null) {
    const recentByAuthor = await sql`
      select 1
      from social_signals
      where author_fid = ${authorFid}
        and created_at > now() - interval '2 minutes'
      limit 1
    `;
    if ((recentByAuthor.rowCount ?? 0) > 0) {
      return NextResponse.json({ ok: true, skipped: "author_cooldown" });
    }
  }

  // per-ticker: 10 minutes (если тикер есть)
  if (tickers.length > 0) {
    const recentByTicker = await sql`
      select 1
      from social_signals
      where tickers && ${tickers}::text[]
        and created_at > now() - interval '10 minutes'
      limit 1
    `;
    if (recentByTicker.rowCount > 0) {
      return NextResponse.json({ ok: true, skipped: "ticker_cooldown" });
    }
  }

  const username = author?.username ?? null;
  const warpcastUrl = toWarpcastUrl(username ?? undefined, castHash);

  // upsert по cast_hash
  await sql`
    insert into social_signals (
      cast_hash, cast_timestamp, warpcast_url,
      text, author_fid, author_username, author_display_name, author_pfp_url, author_score,
      tickers, contracts, raw
    )
    values (
      ${castHash},
      ${timestamp ? new Date(timestamp).toISOString() : null},
      ${warpcastUrl},
      ${text},
      ${authorFid},
      ${author?.username ?? null},
      ${author?.display_name ?? null},
      ${author?.pfp_url ?? null},
      ${authorScore},
      (select coalesce(array_agg(value::text), '{}'::text[]) from jsonb_array_elements_text(${JSON.stringify(tickers)}::jsonb)),
      (select coalesce(array_agg(value::text), '{}'::text[]) from jsonb_array_elements_text(${JSON.stringify(contracts)}::jsonb)),
      ${payload}
    )
    on conflict (cast_hash) do nothing
  `;

  return NextResponse.json({ ok: true });
}
