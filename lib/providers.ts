// lib/providers.ts

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

// URL Clanker
const CLANKER_URL = "https://www.clanker.world/api/tokens";

// --- fetch helper ---
async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// --- normalize clanker ---
export async function fetchTokensFromClanker(): Promise<Token[]> {
  const raw = await fetchJson(CLANKER_URL);

  // 1) Определяем где лежит массив
  let items: any[] = [];

  if (Array.isArray(raw)) {
    // вариант: просто массив
    items = raw;
  } else if (Array.isArray((raw as any).data)) {
    // вариант: { data: [ ... ] }
    items = (raw as any).data;
  } else if (Array.isArray((raw as any).items)) {
    // на всякий случай: { items: [ ... ] }
    items = (raw as any).items;
  } else {
    return [];
  }

  // 2) Нормализуем элементы
  const normalized: Token[] = items
    .map((item: any) => {
      // у некоторых ответов всё лежит в item.data, у некоторых — прямо в item
      const d = item?.data ?? item;

      const addr = (d.contract_address || d.contractAddress || d.pairAddress || "")
        .toString()
        .toLowerCase();

      if (!addr) return null;

      const ticker = (d.ticker || d.symbol || d.name || "").toString();

      return {
        token_address: addr,
        name: ticker,
        symbol: ticker,
        source: "clanker",
        source_url: `https://www.clanker.world/token/${addr}`,
        first_seen_at: d.created_at || d.indexed || d.createdAt,

        // соцсети попробуем вытащить, если есть
        website_url: d.website || undefined,
        x_url: d.twitter || d.x || undefined,
        farcaster_url: d.Farcaster || d.farcaster || undefined,
        telegram_url: d.telegram || undefined,
      } as Token;
    })
    .filter(Boolean) as Token[];

  return normalized;
}
