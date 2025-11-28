"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";

type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string | null;

  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;

  farcaster_url?: string | null;
  x_url?: string | null;
  telegram_url?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  image_url?: string | null;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "—";
  if (Math.abs(value) < 1) return value.toFixed(6);
  if (Math.abs(value) < 10) return value.toFixed(4);
  if (Math.abs(value) < 1000) return value.toFixed(2);
  if (Math.abs(value) < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatCreated(dateString: string | null) {
  if (!dateString) return { time: "—", date: "" };
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { time: dateString, date: "" };

  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const date = d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return { time, date };
}

export default function TokenPage({
  params,
}: {
  params: { address: string };
}) {
  const address = params.address.toLowerCase();
  const [tokens, setTokens] = useState<TokenItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/tokens", { cache: "no-store" });
        const data = await res.json();
        setTokens(data.items || []);
      } catch (e) {
        console.error("Failed to load tokens", e);
        setTokens([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const token = useMemo(() => {
    if (!tokens) return null;
    return tokens.find(
      (t) => t.token_address.toLowerCase() === address
    ) || null;
  }, [tokens, address]);

  if (loading) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <div>Loading token…</div>
        </main>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <div>Token not found.</div>
        </main>
      </div>
    );
  }

  const { time, date } = formatCreated(token.first_seen_at);
  const name = token.name || token.symbol || "New token";
  const symbol = token.symbol || "";
  const mcap = formatNumber(token.market_cap_usd);
  const vol = formatNumber(token.volume_24h_usd);
  const price = formatNumber(token.price_usd);
  const liq = formatNumber(token.liquidity_usd);

  const fullAddress = token.token_address || "";
  const shortAddress =
    fullAddress.length > 8
      ? `${fullAddress.slice(0, 6)}…${fullAddress.slice(-4)}`
      : fullAddress;

  const sourceLabel =
    token.source === "clanker" ? "Clanker" : "Zora";

  const firstLetter =
    (symbol || name).trim().charAt(0).toUpperCase() || "₿";

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell token-page">
        {/* Hero */}
        <div className="token-page-hero">
          <div className="token-page-avatar">
            {token.image_url ? (
              <img src={token.image_url} alt={name} />
            ) : (
              <span>{firstLetter}</span>
            )}
          </div>

          <div className="token-page-hero-main">
            <div className="token-page-hero-top">
              <div>
                <div className="token-page-name">{name}</div>
                {symbol && (
                  <div className="token-page-symbol">{symbol}</div>
                )}
              </div>
              <div className="token-page-meta">
                <div className="token-page-time">
                  {time} · {date}
                </div>
                <span className="token-page-source-pill">
                  {sourceLabel}
                </span>
              </div>
            </div>

            <div className="token-page-hero-bottom">
              <div className="token-page-address">
                <span>Address:</span>
                <span title={fullAddress}>{shortAddress}</span>
              </div>
              <div className="token-page-actions">
                {token.source_url && (
                  <a
                    href={token.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-btn"
                  >
                    View on {sourceLabel}
                  </a>
                )}
                <a
                  href={`https://basescan.org/token/${token.token_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-page-btn secondary"
                >
                  View on BaseScan
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Центр: график + статы */}
        <div className="token-page-main">
          <section className="token-page-chart">
            {/* потом сюда впилим настоящий график */}
            <div className="token-page-chart-placeholder">
              Chart coming soon
            </div>
          </section>

          <section className="token-page-stats">
            <h2 className="token-page-section-title">Stats</h2>
            <div className="token-page-stats-grid">
              <div>
                <div className="label">Price</div>
                <div className="value">{price}</div>
              </div>
              <div>
                <div className="label">Market cap</div>
                <div className="value">{mcap}</div>
              </div>
              <div>
                <div className="label">Liquidity</div>
                <div className="value">{liq}</div>
              </div>
              <div>
                <div className="label">Vol 24h</div>
                <div className="value">{vol}</div>
              </div>
            </div>
          </section>
        </div>

        {/* Соцсети / ссылки */}
        <section className="token-page-socials">
          <h2 className="token-page-section-title">Links</h2>
          <div className="token-page-links-grid">
            <LinkRow label="Website" url={token.website_url} />
            <LinkRow label="X" url={token.x_url} />
            <LinkRow label="Telegram" url={token.telegram_url} />
            <LinkRow label="Instagram" url={token.instagram_url} />
            <LinkRow label="TikTok" url={token.tiktok_url} />
            <LinkRow label="Farcaster" url={token.farcaster_url} />
          </div>
        </section>
      </main>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url?: string | null }) {
  if (!url) {
    return (
      <div className="token-page-link-row">
        <span className="label">{label}</span>
        <span className="value">—</span>
      </div>
    );
  }
  return (
    <div className="token-page-link-row">
      <span className="label">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="value link"
      >
        {url}
      </a>
    </div>
  );
}
