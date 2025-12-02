"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// запретить статическую генерацию этой страницы
export const dynamic = "force-dynamic";

// Тип токена — минимальный набор полей
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

type TokensResponse = {
  count: number;
  items: TokenItem[];
};

// ===== форматтеры =====

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "—";
  if (Math.abs(value) < 1) return value.toFixed(6);
  if (Math.abs(value) < 10) return value.toFixed(4);
  if (Math.abs(value) < 1000) return value.toFixed(2);
  if (Math.abs(value) < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatCreated(dateString: string | null): { time: string; date: string } {
  if (!dateString) return { time: "—", date: "" };
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { time: dateString, date: "" };

  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return { time, date };
}

function extractFarcasterUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

// ===== ВНУТРЕННИЙ КОМПОНЕНТ (в нём все хуки) =====

function TokenPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawAddress = searchParams.get("address") || "";
  const normalizedAddress = rawAddress.trim().toLowerCase();

  const [token, setToken] = useState<TokenItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "invalid" | "not-found" | "ok" | "error"
  >("idle");

  // проверка адреса
  useEffect(() => {
    if (!normalizedAddress) {
      setStatus("invalid");
      return;
    }

    const isHex = /^0x[0-9a-fA-F]{40}$/.test(normalizedAddress);
    if (!isHex) {
      setStatus("invalid");
      return;
    }

    setStatus("idle");
  }, [normalizedAddress]);

  // загрузка токена
  useEffect(() => {
    if (!normalizedAddress) return;
    if (status === "invalid") return;

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/tokens", { cache: "no-store" });
        if (!res.ok) {
          console.error("Tokens API error:", res.status);
          if (!cancelled) setStatus("error");
          return;
        }

        const data: TokensResponse = await res.json();
        const found =
          data.items.find(
            (t) => t.token_address.toLowerCase() === normalizedAddress
          ) || null;

        if (cancelled) return;

        if (!found) {
          setToken(null);
          setStatus("not-found");
        } else {
          setToken(found);
          setStatus("ok");
        }
      } catch (e) {
        console.error("Token page load error:", e);
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [normalizedAddress, status]);

  const { time, date } = useMemo(
    () => formatCreated(token?.first_seen_at ?? null),
    [token?.first_seen_at]
  );

  const mcap = formatNumber(token?.market_cap_usd);
  const vol = formatNumber(token?.volume_24h_usd);
  const price = formatNumber(token?.price_usd);
  const liq = formatNumber(token?.liquidity_usd);

  const farcasterHandle = extractFarcasterUsername(token?.farcaster_url);

  // ===== RENDER =====

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        <div className="token-page-header">
          <h1 className="token-page-title">Token</h1>
          <Link href="/" className="token-page-back">
            ← Back to Hatchr
          </Link>
        </div>

        {!normalizedAddress || status === "invalid" ? (
          <div className="token-page-card">
            <p>Invalid token address.</p>
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              URL should look like: <code>/token?address=0x...</code>
            </p>
          </div>
        ) : isLoading && status === "idle" ? (
          <div className="token-page-card">
            <p>Loading token data…</p>
          </div>
        ) : status === "error" ? (
          <div className="token-page-card">
            <p>Failed to load token data. Try again in a minute.</p>
          </div>
                ) : status === "not-found" || !token ? (
          <div className="token-page-card">
            <p>Token not found.</p>
          </div>
        ) : (
          <div className="token-page-layout">
            {/* левая часть — основная инфа */}
            <section className="token-page-card token-page-main">
              <div className="token-page-main-header">
                <div className="token-page-avatar">
                  {token.image_url ? (
                    <img
                      src={token.image_url}
                      alt={token.name || token.symbol}
                    />
                  ) : (
                    <span>
                      {(token.symbol || token.name || "T")
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="token-page-title-block">
                  <div className="token-page-name-row">
                    <span className="token-page-name">
                      {token.name || token.symbol || "New token"}
                    </span>
                    {token.symbol && token.symbol !== token.name && (
                      <span className="token-page-symbol">
                        {token.symbol}
                      </span>
                    )}
                    <span className="token-page-source-pill">
                      {token.source === "clanker" ? "Clanker" : "Zora"}
                    </span>
                  </div>

                  <div className="token-page-meta-row">
                    {time !== "—" && (
                      <span>
                        Created: <strong>{time}</strong> · {date}
                      </span>
                    )}
                  </div>

                  <div className="token-page-address-row">
                    <span className="token-page-label">Address</span>
                    <code className="token-page-address">
                      {token.token_address}
                    </code>
                  </div>
                </div>
              </div>

              <div className="token-page-stats-grid">
                <div className="token-page-stat-tile">
                  <div className="token-page-stat-label">Price</div>
                  <div className="token-page-stat-value">${price}</div>
                </div>
                <div className="token-page-stat-tile">
                  <div className="token-page-stat-label">Market cap</div>
                  <div className="token-page-stat-value">${mcap}</div>
                </div>
                <div className="token-page-stat-tile">
                  <div className="token-page-stat-label">Liquidity</div>
                  <div className="token-page-stat-value">${liq}</div>
                </div>
                <div className="token-page-stat-tile">
                  <div className="token-page-stat-label">Vol 24h</div>
                  <div className="token-page-stat-value">${vol}</div>
                </div>
              </div>

              {token.source_url && (
                <div className="token-page-actions">
                  <a
                    href={token.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-primary-btn"
                  >
                    View on{" "}
                    {token.source === "clanker" ? "Clanker" : "Zora"}
                  </a>
                </div>
              )}
            </section>

            {/* правая часть — социальные ссылки */}
            <aside className="token-page-card token-page-side">
              <h2 className="token-page-side-title">Socials</h2>
              <ul className="token-page-social-list">
                <li>
                  <span className="token-page-label">Farcaster</span>
                  {farcasterHandle ? (
                    <a
                      href={`https://warpcast.com/${farcasterHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{farcasterHandle}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
                <li>
                  <span className="token-page-label">Website</span>
                  {token.website_url ? (
                    <a
                      href={token.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {token.website_url}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
                <li>
                  <span className="token-page-label">X</span>
                  {token.x_url ? (
                    <a
                      href={token.x_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {token.x_url}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
                <li>
                  <span className="token-page-label">Telegram</span>
                  {token.telegram_url ? (
                    <a
                      href={token.telegram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {token.telegram_url}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
                <li>
                  <span className="token-page-label">Instagram</span>
                  {token.instagram_url ? (
                    <a
                      href={token.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {token.instagram_url}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
                <li>
                  <span className="token-page-label">TikTok</span>
                  {token.tiktok_url ? (
                    <a
                      href={token.tiktok_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {token.tiktok_url}
                    </a>
                  ) : (
                    <span className="token-page-muted">—</span>
                  )}
                </li>
              </ul>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

// ===== ВНЕШНИЙ КОМПОНЕНТ С SUSPENSE =====

export default function TokenPage() {
  return (
    <Suspense
      fallback={
        <div className="hatchr-root">
          <main className="hatchr-shell">
            <div className="token-page-header">
              <h1 className="token-page-title">Token</h1>
              <Link href="/" className="token-page-back">
                ← Back to Hatchr
              </Link>
            </div>
            <div className="token-page-card">
              <p>Loading token…</p>
            </div>
          </main>
        </div>
      }
    >
      <TokenPageInner />
    </Suspense>
  );
}
