// app/token/page.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Token = {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string | null;
  image_url?: string | null;
  farcaster_url?: string;
  website_url?: string;
  x_url?: string;
  telegram_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
};

export default function TokenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawAddress = searchParams.get("address") ?? "";
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // если адреса нет — не дергаем API
    if (!rawAddress) return;

    const addr = rawAddress.toLowerCase().trim();
    if (!addr.startsWith("0x") || addr.length !== 42) {
      setError("Invalid token address.");
      return;
    }

    setLoading(true);
    setError(null);

    fetch("/api/tokens")
      .then((res) => res.json())
      .then((data) => {
        const items: Token[] = data?.items ?? [];
        const found =
          items.find(
            (t) =>
              (t.token_address || "").toLowerCase().trim() === addr
          ) ?? null;
        setToken(found);
        if (!found) {
          setError("Token not found.");
        }
      })
      .catch((e) => {
        console.error("Error loading token:", e);
        setError("Failed to load token data.");
      })
      .finally(() => setLoading(false));
  }, [rawAddress]);

  const handleBack = () => {
    router.push("/");
  };

  // ---------- РЕНДЕР ----------

  const hasAddress = !!rawAddress;

  return (
    <main style={{ padding: "32px" }}>
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          background: "#f5f5f7",
          borderRadius: "16px",
          padding: "24px 28px",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "16px" }}>
          Token
        </h1>

        {/* DEBUG – ПОКА ОСТАВИМ, ЧТОБЫ УВИДЕТЬ АДРЕС */}
        <div
          style={{
            fontSize: "12px",
            background: "#e4e4ea",
            borderRadius: "8px",
            padding: "8px 10px",
            marginBottom: "16px",
            fontFamily: "monospace",
          }}
        >
          debug:
          <br />
          rawAddress = {rawAddress || "(empty)"}
        </div>

        {!hasAddress && (
          <p style={{ marginBottom: "16px" }}>No address in URL.</p>
        )}

        {hasAddress && loading && <p>Loading token data…</p>}

        {hasAddress && !loading && error && (
          <p style={{ marginBottom: "16px" }}>{error}</p>
        )}

        {hasAddress && token && !loading && (
          <div
            style={{
              display: "flex",
              gap: "24px",
              alignItems: "flex-start",
            }}
          >
            {/* Левая колонка: аватар */}
            <div>
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "24px",
                  overflow: "hidden",
                  background: "#ddd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "40px",
                  fontWeight: 600,
                }}
              >
                {token.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={token.image_url}
                    alt={token.name ?? token.symbol ?? "Token"}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  (token.symbol || token.name || "?")
                    .toString()
                    .charAt(0)
                    .toUpperCase()
                )}
              </div>
            </div>

            {/* Правая колонка: инфа */}
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                {token.name || "Unnamed token"}
              </h2>
              <p style={{ margin: 0, marginBottom: "8px", color: "#555" }}>
                {token.symbol ? `${token.symbol} · ` : ""}
                {token.token_address}
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginBottom: "12px",
                  fontSize: "13px",
                }}
              >
                <span>
                  Source:{" "}
                  {token.source_url ? (
                    <a
                      href={token.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {token.source}
                    </a>
                  ) : (
                    token.source || "—"
                  )}
                </span>
                <span>
                  Price:{" "}
                  {token.price_usd != null
                    ? `$${token.price_usd.toFixed(6)}`
                    : "—"}
                </span>
                <span>
                  MC:{" "}
                  {token.market_cap_usd != null
                    ? `$${token.market_cap_usd.toLocaleString()}`
                    : "—"}
                </span>
                <span>
                  Vol 24h:{" "}
                  {token.volume_24h_usd != null
                    ? `$${token.volume_24h_usd.toLocaleString()}`
                    : "—"}
                </span>
              </div>

              {/* Соцсети */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {token.farcaster_url && (
                  <a href={token.farcaster_url} target="_blank" rel="noreferrer">
                    Farcaster
                  </a>
                )}
                {token.x_url && (
                  <a href={token.x_url} target="_blank" rel="noreferrer">
                    X
                  </a>
                )}
                {token.website_url && (
                  <a
                    href={token.website_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                )}
                {token.telegram_url && (
                  <a
                    href={token.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram
                  </a>
                )}
                {token.instagram_url && (
                  <a
                    href={token.instagram_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instagram
                  </a>
                )}
                {token.tiktok_url && (
                  <a href={token.tiktok_url} target="_blank" rel="noreferrer">
                    TikTok
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleBack}
          style={{
            marginTop: "20px",
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid #aaa",
            background: "white",
            cursor: "pointer",
          }}
        >
          ← Back to Hatchr
        </button>
      </div>
    </main>
  );
}
