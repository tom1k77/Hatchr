import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

const EVENT_PATTERNS: Array<{ type: string; re: RegExp; boost: number }> = [
  { type: "listing", re: /\b(listing|listed|cex|binance|coinbase|bybit|okx|kraken)\b/i, boost: 3 },
  { type: "airdrop", re: /\b(airdrop|claim|snapshot|allowlist|whitelist)\b/i, boost: 3 },
  { type: "launch", re: /\b(launch|live|mainnet|testnet|mint|minting)\b/i, boost: 2 },
  { type: "partnership", re: /\b(partnership|partner|integration|integrated)\b/i, boost: 2 },
  { type: "security", re: /\b(exploit|hack|drained|vulnerability|incident|security)\b/i, boost: 4 },
  { type: "migration", re: /\b(migration|migrate|bridge|bridging)\b/i, boost: 2 },
  { type: "tokenomics", re: /\b(tokenomics|supply|emissions|vesting)\b/i, boost: 2 },
];

const BANTER_RE = /\b(gm|gn|wen|lol|lmao|ape|pump|send|moon|wagmi|ngmi)\b/i;
const LINK_RE = /(https?:\/\/|warpcast\.com|zora\.co|basescan\.org|base\.org|github\.com|mirror\.xyz)/i;

function computeImportance(text: string | null, tickers: string[] | null, contracts: string[] | null, authorScore: number | null) {
  const t = (text ?? "").trim();

  let score = 0;
  let eventType: string | null = null;

  // база: если есть контракт и тикер вместе — чаще полезно
  const hasTicker = (tickers?.length ?? 0) > 0;
  const hasContract = (contracts?.length ?? 0) > 0;
  if (hasTicker && hasContract) score += 2;

  // ссылка на анонс/док — часто сигнал
  if (LINK_RE.test(t)) score += 2;

  // эвенты
  for (const p of EVENT_PATTERNS) {
    if (p.re.test(t)) {
      score += p.boost;
      eventType = eventType ?? p.type; // первый найденный тип
    }
  }

  // бантер-штраф (только если пост короткий)
  if (t.length < 160 && BANTER_RE.test(t)) score -= 3;

  // небольшой бонус за высокий author score (но не решающий)
  if (typeof authorScore === "number") {
    if (authorScore >= 0.95) score += 1;
    else if (authorScore >= 0.9) score += 0.5;
  }

  // ограничим диапазон
  if (score < -5) score = -5;
  if (score > 10) score = 10;

  return { importance_score: score, event_type: eventType };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") ?? "25"), 100);
  const mode = (searchParams.get("mode") ?? "all").toLowerCase(); // all | important
  const importantMin = Number(searchParams.get("important_min") ?? "3"); // порог “Important”
  const minScore = searchParams.get("min_score");
  const minScoreNum = minScore != null ? Number(minScore) : null;

  // Базовая выборка (сырой слой).
  // ВАЖНО: тут не дергаем Neynar, только Postgres.
  const { rows } = await sql`
    select
      cast_hash,
      cast_timestamp,
      warpcast_url,
      text,
      author_fid,
      author_username,
      author_display_name,
      author_pfp_url,
      author_score,
      tickers,
      contracts,
      created_at
    from social_signals
    ${minScoreNum != null ? sql`where author_score >= ${minScoreNum}` : sql``}
    order by coalesce(cast_timestamp, created_at) desc
    limit ${limit};
  `;

  // Пост-обработка: importance + простая очистка “мегаспама”
  const enriched = rows
    .map((r: any) => {
      const tickers = (r.tickers ?? []) as string[];
      const contracts = (r.contracts ?? []) as string[];

      // если тикеров слишком много — это почти всегда шум
      if (tickers.length > 8) {
        return null;
      }

      const { importance_score, event_type } = computeImportance(
        r.text,
        tickers,
        contracts,
        r.author_score
      );

      return {
        ...r,
        tickers,
        contracts,
        importance_score,
        event_type,
      };
    })
    .filter(Boolean) as any[];

  // Режим Important: фильтруем и сортируем по важности
  let items = enriched;
  if (mode === "important") {
    items = items
      .filter((x) => Number(x.importance_score ?? 0) >= importantMin)
      .sort((a, b) => {
        const sa = Number(a.importance_score ?? 0);
        const sb = Number(b.importance_score ?? 0);
        if (sb !== sa) return sb - sa;
        const ta = new Date(a.cast_timestamp ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.cast_timestamp ?? b.created_at ?? 0).getTime();
        return tb - ta;
      });
  }

  return NextResponse.json({ items });
}
