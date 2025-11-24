export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  image_url?: string | null;
  first_seen_at?: string | null;

  farcaster_url?: string | null;
  website_url?: string | null;
  x_url?: string | null;
  telegram_url?: string | null;
}

export interface TokenWithMarket extends Token {
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
}
