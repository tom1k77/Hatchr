// app/api/tokens/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnyToken = any;

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(t) };
}

async function safeCall<T>(label: string, fn: () => Promise<T>, fallback: T) {
  try {
    const data = await fn();
    return { ok: true as const, data, error: null as string | null };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : (e?.message ?? String(e));
    console.error(`[tokens][${label}]`, msg);
    return { ok: false as const, data: fallback, error: msg };
  }
}

/**
 * ======================= API-level stale market cache =======================
 * Цель: если upstream (providers/gecko) вернул null/0 — не затирать последнюю валидную цифру.
 * В Vercel живёт пока "тёплый" инстанс жив.
 */
type MarketSnap = {
  ts: number;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
};

const marketCache = new Map<string, MarketSnap>();
const MARKET_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function isFinitePos(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function getCachedMarket(addr: string): MarketSnap | null {
  const v = marketCache.get(addr);
  if (!v) return null;
  if (Date.now() - v.ts > MARKET_CACHE_TTL_MS) {
    marketCache.delete(addr);
    return null;
  }
  return v;
}

function saveCachedMarket(addr: string, snap: Omit<MarketSnap, "ts">) {
  const hasAny =
    isFinitePos(snap.price_usd) ||
    isFinitePos(snap.market_cap_usd) ||
    isFinitePos(snap.liquidity_usd) ||
    isFinitePos(snap.volume_24h_usd);

  if (!hasAny) return;
  marketCache.set(addr, { ts: Date.now(), ...snap });
}

function mapToken(t: AnyToken) {
  const addr = String(t?.token_address ?? "").toLowerCase();
  const cached = addr ? getCachedMarket(addr) : null;

  // берём новые, но если они null/0/NaN — оставляем старые из кэша
  const priceNew = t?.price_usd;
  const mcapNew = t?.market_cap_usd;
  const liqNew = t?.liquidity_usd;
  const volNew = t?.volume_24h_usd;

  const mergedMarket = {
    price_usd: isFinitePos(priceNew) ? priceNew : (cached?.price_usd ?? null),
    market_cap_usd: isFinitePos(mcapNew) ? mcapNew : (cached?.market_cap_usd ?? null),
    liquidity_usd: isFinitePos(liqNew) ? liqNew : (cached?.liquidity_usd ?? null),
    volume_24h_usd: isFinitePos(volNew) ? volNew : (cached?.volume_24h_usd ?? null),
  };

  if (addr) saveCachedMarket(addr, mergedMarket);

  return {
    token_address: t.token_address,
    name: t.name ?? "",
    symbol: t.symbol ?? "",
    source: t.source ?? "",
    source_url: t.source_url ?? "",
    first_seen_at: t.first_seen_at ?? null,

    ...mergedMarket,

    farcaster_url: t.farcaster_url ?? null,
    x_url: t.x_url ?? null,
    telegram_url: t.telegram_url ?? null,
    website_url: t.website_url ?? null,
    instagram_url: t.instagram_url ?? null,
    tiktok_url: t.tiktok_url ?? null,
    image_url: t.image_url ?? null,

    // ВАЖНО: пробрасываем FID создателя!
    farcaster_fid: t.farcaster_fid ?? null,
  };
}

export async function GET() {
  // Делаем динамический import, чтобы можно было “прощупать” какие функции реально экспортируются
  const providers: any = await import("@/lib/providers");

  // ✅ Если есть отдельные провайдеры — используем allSettled и НЕ роняем выдачу
  const hasSplit =
    typeof providers.getClankerTokens === "function" || typeof providers.getZoraTokens === "function";

  if (hasSplit) {
    const { signal, cleanup } = withTimeout(12_000);

    try {
      const clankerFn =
        typeof providers.getClankerTokens === "function"
          ? () => providers.getClankerTokens({ signal })
          : async () => [];

      const zoraFn =
        typeof providers.getZoraTokens === "function"
          ? () => providers.getZoraTokens({ signal })
          : async () => [];

      const [clanker, zora] = await Promise.all([
        safeCall("clanker", clankerFn, [] as AnyToken[]),
        safeCall("zora", zoraFn, [] as AnyToken[]),
      ]);

      const itemsRaw = [...clanker.data, ...zora.data];
      const items = itemsRaw.map(mapToken);

      return NextResponse.json({
        count: items.length,
        items,
        meta: {
          sources: {
            clanker: { ok: clanker.ok, error: clanker.error },
            zora: { ok: zora.ok, error: zora.error },
          },
        },
      });
    } finally {
      cleanup();
    }
  }

  // ✅ Фоллбек: если у тебя пока только getTokens()
  if (typeof providers.getTokens !== "function") {
    return NextResponse.json(
      { count: 0, items: [], meta: { error: "Missing getTokens() in @/lib/providers" } },
      { status: 200 }
    );
  }

  const { cleanup } = withTimeout(12_000);
  try {
    const result = await safeCall("getTokens", () => providers.getTokens(), [] as AnyToken[]);
    const items = (result.data ?? []).map(mapToken);

    return NextResponse.json({
      count: items.length,
      items,
      meta: {
        sources: {
          aggregated: { ok: result.ok, error: result.error },
        },
      },
    });
  } finally {
    cleanup();
  }
}
