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

  // Ответ Clanker — это просто огромный массив объектов
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => {
      const d = item?.data;
      if (!d) return null;

      const addr = d.contract_address?.toLowerCase();
      if (!addr) return null;

      return {
        token_address: addr,
        name: d.ticker || "",
        symbol: d.ticker || "",
        source: "clanker",
        source_url: `https://www.clanker.world/token/${addr}`,
        first_seen_at: d.created_at || d.indexed,

        // соцсети
        website_url: d?.website || null,
        x_url: d?.twitter || null,
        farcaster_url: d?.Farcaster || null,
        telegram_url: d?.telegram || null,
      } as Token;
    })
    .filter(Boolean) as Token[];
}
