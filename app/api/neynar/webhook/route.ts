import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

function verifyNeynarSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.NEYNAR_WEBHOOK_SECRET;
  if (!secret) throw new Error("NEYNAR_WEBHOOK_SECRET is not set");
  if (!signatureHeader) throw new Error("X-Neynar-Signature missing");

  const hmac = createHmac("sha512", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");

  // timing-safe compare
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractTickers(text: string) {
  // $HATCHR, $BASE, $A0B etc.
  const re = /\$[A-Za-z0-9]{2,12}\b/g;
  return Array.from(new Set((text.match(re) ?? []).map((t) => t.toUpperCase())));
}

function extractContracts(text: string) {
  // 0x... (EVM address)
  const re = /\b0x[a-fA-F0-9]{40}\b/g;
  return Array.from(new Set(text.match(re) ?? []).map((x) => x.toLowerCase()));
}

function toWarpcastUrl(username?: string, castHash?: string) {
  if (!username || !castHash) return null;
  // Warpcast обычно принимает /<username>/<first8>
  return `https://warpcast.com/${username}/${castHash.slice(0, 8)}`;
}

export async function GET() {
  // Neynar любит дергать endpoint для проверки доступности
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const sig = req.headers.get("X-Neynar-Signature");
  const ok = verifyNeynarSignature(rawBody, sig);
  if (!ok) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });

  const payload = JSON.parse(rawBody);

  // ⚠️ В webhook payload структура может отличаться по полям,
  // но почти всегда есть cast + author + text/hash/timestamp.
  const cast = payload?.data?.cast ?? payload?.cast ?? payload?.data ?? payload;
  const author = cast?.author ?? payload?.data?.author ?? null;

  const text: string = cast?.text ?? "";
  const castHash: string | undefined = cast?.hash ?? cast?.cast_hash;
  const timestamp = cast?.timestamp ?? cast?.created_at ?? null;

  const authorScore: number | null =
    typeof author?.score === "number" ? author.score : null;

  const minScore = Number(process.env.NEYNAR_MIN_SCORE ?? "0.7");
  if (authorScore == null || authorScore < minScore) {
    return NextResponse.json({ ok: true, skipped: "low_score" });
  }

  if (!castHash) {
    return NextResponse.json({ ok: true, skipped: "no_cast_hash" });
  }

  const tickers = extractTickers(text);
  const contracts = extractContracts(text);

  // если вообще нет совпадений — это не “token signal”
  if (tickers.length === 0 && contracts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no_token_mentions" });
  }

  const username = author?.username ?? null;
  const warpcastUrl = toWarpcastUrl(username ?? undefined, castHash);

  // upsert по cast_hash (чтобы не было дублей)
  await sql`
    insert into social_signals (
      cast_hash, cast_timestamp, warpcast_url,
      text, author_fid, author_username, author_display_name, author_pfp_url, author_score,
      tickers, contracts, raw
    )
    values (
      ${castHash},
      ${timestamp ? new Date(timestamp) : null},
      ${warpcastUrl},
      ${text},
      ${author?.fid ?? null},
      ${author?.username ?? null},
      ${author?.display_name ?? null},
      ${author?.pfp_url ?? null},
      ${authorScore},
      ${tickers},
      ${contracts},
      ${payload}
    )
    on conflict (cast_hash) do nothing;
  `;

  return NextResponse.json({ ok: true });
}
