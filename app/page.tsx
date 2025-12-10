"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  farcaster_fid?: number | null;
  website_url?: string | null;
  x_url?: string | null;
  telegram_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  image_url?: string | null;
};

type TokenResponse = {
  token: TokenItem | null;
};

type FollowersResponse = {
  creator_fid: number;
  total: number;
  ultraOg: Follower[];
  og: Follower[];
  others: Follower[];
};

type Follower = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
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

function formatCreated(
  dateString: string | null
): { time: string; date: string } {
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

function FarcasterFallbackIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/farcaster-logo.png"
      alt="Farcaster"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        objectFit: "cover",
        backgroundColor: "#1f2933",
      }}
    />
  );
}

export default function TokenPage() {
  // address читаем из location.search на клиенте
  const [addressParam, setAddressParam] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const addr = params.get("address");
    setAddressParam(addr ? addr.toLowerCase() : "");
  }, []);

  const [token, setToken] = useState<TokenItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creatorScore, setCreatorScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  const [followersInfo, setFollowersInfo] = useState<FollowersResponse | null>(
    null
  );
  const [followersLoading, setFollowersLoading] = useState(false);

  // загрузка токена
  useEffect(() => {
    if (!addressParam) return;

    async function loadToken() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/token?address=${addressParam}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Token API error: ${res.status}`);

        const data: TokenResponse = await res.json();
        setToken(data.token ?? null);
      } catch (e) {
        console.error(e);
        setError("Failed to load token");
      } finally {
        setLoading(false);
      }
    }

    loadToken();
  }, [addressParam]);

  const farcasterUsername = useMemo(
    () => extractFarcasterUsername(token?.farcaster_url ?? null),
    [token]
  );

  // Neynar score
  useEffect(() => {
    if (!farcasterUsername) return;
    const username = farcasterUsername;

    async function loadScore(u: string) {
      try {
        setScoreLoading(true);
        setCreatorScore(null);

        const res = await fetch(
          `/api/token-score?username=${encodeURIComponent(u)}`
        );
        if (!res.ok) {
          console.warn("token-score error", res.status);
          return;
        }
        const json = await res.json();
        if (typeof json.score === "number") {
          setCreatorScore(json.score);
        }
      } catch (e) {
        console.error("token-score fetch failed", e);
      } finally {
        setScoreLoading(false);
      }
    }

    loadScore(username);
  }, [farcasterUsername]);

  // followers по fid
  useEffect(() => {
    const fid = token?.farcaster_fid;
    if (!fid) return;

    let cancelled = false;

    async function loadFollowers(currentFid: number) {
      try {
        setFollowersLoading(true);
        setFollowersInfo(null);

        const res = await fetch(`/api/token-followers?fid=${currentFid}`);
        if (!res.ok) {
          console.warn("token-followers error", res.status);
          return;
        }
        const json: FollowersResponse = await res.json();
        if (!cancelled) setFollowersInfo(json);
      } catch (e) {
        console.error("token-followers fetch failed", e);
      } finally {
        if (!cancelled) setFollowersLoading(false);
      }
    }

    loadFollowers(fid);

    return () => {
      cancelled = true;
    };
  }, [token?.farcaster_fid]);

  // address ещё не считали
  if (addressParam === null) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  // параметр отсутствует
  if (!addressParam) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <p>Missing address</p>
        </main>
      </div>
    );
  }

  if (loading && !token) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <p>Loading token…</p>
        </main>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <Link href="/" className="hatchr-nav-pill" style={{ marginBottom: 16 }}>
            ← Back to Hatchr
          </Link>
          <p>Token not found</p>
        </main>
      </div>
    );
  }

  const { time, date } = formatCreated(token.first_seen_at);
  const symbol = token.symbol || "";
  const name = token.name || symbol || "New token";
  const sourceLabel = token.source === "clanker" ? "Clanker" : "Zora";

  const mcap = formatNumber(token.market_cap_usd);
  const vol = formatNumber(token.volume_24h_usd);
  const liq = formatNumber(token.liquidity_usd);
  const price = formatNumber(token.price_usd);

  const fullAddress = token.token_address || "";
  const shortAddress =
    fullAddress.length > 8
      ? `0x${fullAddress.slice(2, 6)}…${fullAddress.slice(-4)}`
      : fullAddress;

  const ultraOgTop = followersInfo?.ultraOg.slice(0, 8) ?? [];
  const ogTop = followersInfo?.og.slice(0, 12) ?? [];

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Token</h1>
          <Link href="/" className="hatchr-nav-pill">
            ← Back to Hatchr
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
            gap: 24,
          }}
        >
          {/* ЛЕВАЯ КАРТОЧКА */}
          <section
            style={{
              background: "#f9fafb",
              borderRadius: 24,
              padding: 24,
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 24,
                  background: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {token.image_url ? (
                  <img
                    src={token.image_url}
                    alt={name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    style={{
                      color: "white",
                      fontSize: 28,
                      fontWeight: 600,
                    }}
                  >
                    {(symbol || name).trim().charAt(0).toUpperCase() || "₿"}
                  </span>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{name}</span>
                  {symbol && symbol !== name && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#6b7280",
                        textTransform: "uppercase",
                      }}
                    >
                      {symbol}
                    </span>
                  )}
                  <span
                    style={{
                      padding: "2px 8px",
                      fontSize: 11,
                      borderRadius: 999,
                      background: "#e0f2fe",
                      color: "#0369a1",
                      fontWeight: 500,
                    }}
                  >
                    {sourceLabel}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Created: {time} · {date}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  Address{" "}
                  <span style={{ fontWeight: 500 }} title={fullAddress}>
                    {shortAddress}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Price
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  ${price}
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Market cap
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>${mcap}</div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Liquidity
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>${liq}</div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Vol 24h
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>${vol}</div>
              </div>
            </div>

            {token.source_url && (
              <div style={{ marginTop: 24 }}>
                <a
                  href={token.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 18px",
                    borderRadius: 999,
                    background: "#2563eb",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  View on {sourceLabel}
                </a>
              </div>
            )}
          </section>

          {/* ПРАВЫЙ БЛОК: Socials + Hatchr score + Followers */}
          <section
            style={{
              background: "#f9fafb",
              borderRadius: 24,
              padding: 24,
              border: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Socials */}
            <div>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                Socials
              </h2>

              <div
                style={{
                  display: "grid",
                  rowGap: 8,
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ color: "#6b7280" }}>Farcaster</span>{" "}
                  {farcasterUsername ? (
                    <a
                      href={`https://warpcast.com/${farcasterUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      @{farcasterUsername}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>Website</span>{" "}
                  {token.website_url ? (
                    <a
                      href={token.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {token.website_url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>X</span>{" "}
                  {token.x_url ? (
                    <a
                      href={token.x_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {token.x_url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>Telegram</span>{" "}
                  {token.telegram_url ? (
                    <a
                      href={token.telegram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {token.telegram_url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>Instagram</span>{" "}
                  {token.instagram_url ? (
                    <a
                      href={token.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {token.instagram_url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>TikTok</span>{" "}
                  {token.tiktok_url ? (
                    <a
                      href={token.tiktok_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {token.tiktok_url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            {/* Hatchr / Neynar creator score */}
            <div
              style={{
                background: "white",
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Hatchr creator score
                </span>
                {farcasterUsername && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    <FarcasterFallbackIcon size={20} />
                    <span>@{farcasterUsername}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {scoreLoading
                  ? "…"
                  : creatorScore != null
                  ? creatorScore
                  : "No data"}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "#9ca3af",
                }}
              >
                v1 — Neynar creator score. Followers breakdown below.
              </div>
            </div>

            {/* Followers breakdown */}
            <div
              style={{
                background: "white",
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                padding: 16,
                flex: 1,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Creator followers
                </span>
                {followersLoading && (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    loading…
                  </span>
                )}
              </div>

              {followersInfo ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    <span>
                      Total:{" "}
                      <strong>{followersInfo.total.toLocaleString()}</strong>
                    </span>
                    <span>
                      Ultra-OG (&lt;1000 FID):{" "}
                      <strong>{followersInfo.ultraOg.length}</strong>
                    </span>
                    <span>
                      OG (1000–9999):{" "}
                      <strong>{followersInfo.og.length}</strong>
                    </span>
                  </div>

                  {ultraOgTop.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          fontSize: 11,
                          textTransform: "uppercase",
                          color: "#9ca3af",
                          marginBottom: 4,
                        }}
                      >
                        Ultra-OG handles (&lt;1000 fid)
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        {ultraOgTop.map((f) => (
                          <a
                            key={f.fid}
                            href={`https://warpcast.com/${f.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              textDecoration: "none",
                              color: "#111827",
                              background: "#f9fafb",
                            }}
                          >
                            @{f.username}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {ogTop.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          textTransform: "uppercase",
                          color: "#9ca3af",
                          marginBottom: 4,
                        }}
                      >
                        OG handles (1000–9999 fid)
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        {ogTop.map((f) => (
                          <a
                            key={f.fid}
                            href={`https://warpcast.com/${f.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              textDecoration: "none",
                              color: "#111827",
                              background: "#f9fafb",
                            }}
                          >
                            @{f.username}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {ultraOgTop.length === 0 && ogTop.length === 0 && (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      No OG followers in top lists yet.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {followersLoading
                    ? "Loading followers…"
                    : "No followers data yet."}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
