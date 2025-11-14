// lib/providers.ts

// Базовый тип токена, который мы возвращаем на фронт
export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;
  website_url?: string;
  x_url?: string;
  farcaster_url?: string;
  telegram_url?: string;
}

// Тип с данными рынка
export interface TokenWithMarket extends Token {
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h?: number;
}

// URL Clanker (пока без пагинации — берём первую страницу)
const CLANKER_URL = "https://www.clanker.world/api/tokens";

// DexScreener токены
const DEX_URL = "https://api.dexscreener.com/latest/dex/tokens";

// --- общий fetch ---
async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/**
 * Забираем токены из Clanker и приводим их в наш формат
 */
export async function fetchTokensFromClanker(): Promise<Token[]> {
  const raw = await fetchJson(CLANKER_URL);

  // Clanker может вернуть массив или объект вида { data: [...] } или { items: [...] }
  let items: any[] = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (Array.isArray((raw as any).data)) {
    items = (raw as any).data;
  } else if (Array.isArray((raw as any).items)) {
    items = (raw as any).items;
  } else {
    return [];
  }

  const normalized: Token[] = items
    .map((item: any) => {
      const d = item?.data ?? item;

      const addr = (d.contract_address || d.contractAddress || "").toString().toLowerCase();
      if (!addr) return null;

      // Пытаемся разделить нормальное название и тикер
      const name = (d.name || d.tokenName || d.ticker || d.symbol || "").toString();
      const symbol = (d.ticker || d.symbol || d.name || "").toString();

      // соцсети/сайт (и проекта, и создателя, если поля так называются)
      const website =
        d.website || d.site || d.projectWebsite || d.social_website || undefined;
      const twitter =
        d.creatorTwitter ||
        d.creatorX ||
        d.twitter ||
        d.x ||
        d.social_twitter ||
        undefined;
      const farcaster =
        d.creatorFarcaster ||
        d.Farcaster ||
        d.farcaster ||
        d.social_farcaster ||
        undefined;
      const telegram =
        d.telegram || d.social_telegram || undefined;

      return {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: `https://www.clanker.world/token/${addr}`,
        first_seen_at: d.created_at || d.indexed || d.createdAt,
        website_url: website,
        x_url: twitter,
        farcaster_url: farcaster,
        telegram_url: telegram,
      } as Token;
    })
    .filter(Boolean) as Token[];

  return normalized;
}

/**
 * Обогащаем токены ценой / ликвидностью / объёмом через DexScreener
 */
export async function enrichWithDexScreener(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(`${DEX_URL}/${t.token_address}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        result.push({ ...t });
        continue;
      }

      const data = await res.json();
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      // Ищем пару на Base, если нет — берём первую попавшуюся
      const pair =
        pairs.find((p: any) => p.chainId === "base") || (pairs.length ? pairs[0] : null);

      if (!pair) {
        result.push({ ...t });
        continue;
      }

      result.push({
        ...t,
        price_usd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
        liquidity_usd: pair.liquidity?.usd ? Number(pair.liquidity.usd) : undefined,
        volume_24h: pair.volume?.h24 ? Number(pair.volume.h24) : undefined,
      });
    } catch {
      // Если что-то пошло не так — просто возвращаем токен как есть
      result.push({ ...t });
    }
  }

  return result;
}

/**
 * (Шаблон на будущее) — как тянуть несколько страниц с Clanker.
 * Когда разберёшься в их параметрах пагинации (page / limit / perPage),
 * можно будет заменить fetchTokensFromClanker на версию, которая в цикле
 * забирает все страницы и склеивает их.
 *
 * Пример структуры:
 *
 * async function fetchAllPagesFromClanker(): Promise<Token[]> {
 *   let page = 1;
 *   const all: any[] = [];
 *   while (page <= 5) {
 *     const raw = await fetchJson(`https://www.clanker.world/api/tokens?page=${page}`);
 *     // обработка raw как выше...
 *     page++;
 *   }
 *   return allNormalised;
 * }
 */
