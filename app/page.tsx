"use client";

import { useEffect, useMemo, useState } from "react";

type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string;
  price_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  farcaster_url?: string | null;
};

type TokensResponse = {
  count: number;
  items: TokenItem[];
};

type FarcasterProfile = {
  username: string;
  display_name: string;
  pfp_url: string | null;
  follower_count: number;
  following_count: number;
};

const REFRESH_INTERVAL_MS = 30000; // авто-обновление каждые 30 секунд

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) < 1) return value.toFixed(6);
  if (Math.abs(value) < 10) return value.toFixed(4);
  if (Math.abs(value) < 1000) return value.toFixed(2);
  if (Math.abs(value) < 1_000_000)
    return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatDate(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

export default function HomePage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">(
    "all"
  );
  const [minLiquidity, setMinLiquidity] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Record<string, FarcasterProfile>>({});
  const [profileLoading, setProfileLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [hoveredUsername, setHoveredUsername] = useState<string | null>(null);

  // загрузка токенов
  async function loadTokens() {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Tokens API error: ${res.status}`);
      }

      const data: TokensResponse = await res.json();
      setTokens(data.items || []);
    } catch (e: any) {
      console.error(e);
      setError("Не удалось загрузить токены. Попробуй обновить страницу позже.");
    } finally {
      setIsLoading(false);
    }
  }

  // авто-обновление
  useEffect(() => {
    loadTokens();
    const id = setInterval(loadTokens, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // фильтрация токенов
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (minLiquidity > 0) {
        const liq = t.liquidity_usd ?? 0;
        if (liq < minLiquidity) return false;
      }
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const name = (t.name || "").toLowerCase();
        const symbol = (t.symbol || "").toLowerCase();
        const addr = (t.token_address || "").toLowerCase();
        if (!name.includes(s) && !symbol.includes(s) && !addr.includes(s)) {
          return false;
        }
      }
      return true;
    });
  }, [tokens, sourceFilter, minLiquidity, search]);

  // загрузка профиля Neynar (через наш API-роут)
  async function ensureProfile(username: string) {
    if (!username) return;
    if (profiles[username] || profileLoading[username]) return;

    setProfileLoading((prev) => ({ ...prev, [username]: true }));
    try {
      const res = await fetch(
        `/api/farcaster-profile?username=${encodeURIComponent(username)}`
      );
      if (!res.ok) {
        console.warn("Profile API error for", username, res.status);
        return;
      }
      const data: FarcasterProfile = await res.json();
      setProfiles((prev) => ({ ...prev, [username]: data }));
    } catch (e) {
      console.error("Profile fetch failed for", username, e);
    } finally {
      setProfileLoading((prev) => ({ ...prev, [username]: false }));
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "20px 24px 24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}
      >
        <header
          style={{
            marginBottom: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <h1 style={{ fontSize: "20px", margin: 0 }}>
            New Base Tokens (Zora + Clanker)
          </h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
            Auto-refresh every 30 seconds. Market data from DexScreener.
          </p>
        </header>

        {/* Фильтры + поиск */}
        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <label
              style={{
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Source:
              <select
                value={sourceFilter}
                onChange={(e) =>
                  setSourceFilter(e.target.value as "all" | "clanker" | "zora")
                }
                style={{
                  fontSize: "13px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  background: "#fff",
                }}
              >
                <option value="all">All</option>
                <option value="clanker">Clanker</option>
                <option value="zora">Zora</option>
              </select>
            </label>

            <label
              style={{
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Min Liquidity (USD):
              <input
                type="number"
                value={minLiquidity}
                onChange={(e) =>
                  setMinLiquidity(Number(e.target.value) || 0)
                }
                style={{
                  width: "90px",
                  fontSize: "13px",
                  padding: "4px 6px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                }}
              />
            </label>
          </div>

          <div style={{ flex: "0 0 260px" }}>
            <input
              type="text"
              placeholder="Search name / symbol / address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                fontSize: "13px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid #ddd",
              }}
            />
          </div>
        </section>

        {error && (
          <div
            style={{
              marginBottom: "12px",
              padding: "8px 10px",
              borderRadius: "8px",
              backgroundColor: "#ffe5e5",
              color: "#b00020",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {/* Таблица */}
        <div
          style={{
            borderRadius: "10px",
            border: "1px solid #eee",
            overflow: "hidden",
            backgroundColor: "#fff",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "#fafafa",
                  borderBottom: "1px solid #eee",
                }}
              >
                {[
                  "Name",
                  "Address",
                  "Source",
                  "Liquidity",
                  "Price",
                  "Vol 24h",
                  "Socials",
                  "Seen",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Name" ? "left" : "right",
                      padding: "8px 10px",
                      fontWeight: 500,
                      color: "#555",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTokens.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "18px 10px",
                      textAlign: "center",
                      color: "#777",
                      fontSize: "13px",
                    }}
                  >
                    {isLoading
                      ? "Загружаем данные…"
                      : "Пока пусто. Обнови страницу позже."}
                  </td>
                </tr>
              )}

              {filteredTokens.map((token) => {
                const username = extractFarcasterUsername(
                  token.farcaster_url || undefined
                );
                const profile = username ? profiles[username] : undefined;
                const isHovered = hoveredUsername === username;

                return (
                  <tr
                    key={`${token.source}-${token.token_address}`}
                    style={{
                      borderBottom: "1px solid #f2f2f2",
                    }}
                  >
                    {/* Name (кликабельно на Clanker/Zora) */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "left",
                        maxWidth: "260px",
                      }}
                    >
                      <a
                        href={token.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          textDecoration: "none",
                          color: "#111827",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {token.name || token.symbol || "—"}
                        </span>
                        {token.symbol && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#6b7280",
                              textTransform: "uppercase",
                            }}
                          >
                            {token.symbol}
                          </span>
                        )}
                      </a>
                    </td>

                    {/* Address */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {token.token_address
                        ? token.token_address.slice(0, 6) +
                          "..." +
                          token.token_address.slice(-4)
                        : "—"}
                    </td>

                    {/* Source */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        textTransform: "lowercase",
                      }}
                    >
                      {token.source}
                    </td>

                    {/* Liquidity */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(token.liquidity_usd)}
                    </td>

                    {/* Price */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(token.price_usd)}
                    </td>

                    {/* Vol 24h */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(token.volume_24h_usd)}
                    </td>

                    {/* Socials (Farcaster аватар + попап) */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        position: "relative",
                      }}
                    >
                      {username ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            position: "relative",
                          }}
                          onMouseEnter={() => {
                            setHoveredUsername(username);
                            ensureProfile(username);
                          }}
                          onMouseLeave={() => setHoveredUsername(null)}
                        >
                          <a
                            href={`https://farcaster.xyz/${username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "3px 8px",
                              borderRadius: "999px",
                              backgroundColor: "#5b3ded",
                              color: "#fff",
                              textDecoration: "none",
                              fontSize: "12px",
                            }}
                          >
                            {/* Аватар или fallback-иконка */}
                            {profile?.pfp_url ? (
                              <img
                                src={profile.pfp_url}
                                alt={profile.display_name || username}
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "999px",
                                  objectFit: "cover",
                                  backgroundColor: "#1f2933",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "999px",
                                  background:
                                    "linear-gradient(135deg,#7c3aed,#4f46e5)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                }}
                              >
                                F
                              </div>
                            )}

                            <span
                              style={{
                                maxWidth: "110px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              @{username}
                            </span>
                          </a>

                          {/* Попап профиля */}
                          {isHovered && profile && (
                            <div
                              style={{
                                position: "absolute",
                                top: "110%",
                                right: 0,
                                marginTop: "6px",
                                padding: "10px 12px",
                                borderRadius: "10px",
                                backgroundColor: "#111827",
                                color: "#f9fafb",
                                minWidth: "220px",
                                boxShadow:
                                  "0 12px 30px rgba(0,0,0,0.35)",
                                zIndex: 20,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  marginBottom: "8px",
                                }}
                              >
                                {profile.pfp_url ? (
                                  <img
                                    src={profile.pfp_url}
                                    alt={profile.display_name || username}
                                    style={{
                                      width: "38px",
                                      height: "38px",
                                      borderRadius: "999px",
                                      objectFit: "cover",
                                      backgroundColor: "#1f2933",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: "38px",
                                      height: "38px",
                                      borderRadius: "999px",
                                      background:
                                        "linear-gradient(135deg,#7c3aed,#4f46e5)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontWeight: 700,
                                    }}
                                  >
                                    F
                                  </div>
                                )}
                                <div>
                                  <div
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      marginBottom: "2px",
                                    }}
                                  >
                                    {profile.display_name ||
                                      profile.username}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#9ca3af",
                                    }}
                                  >
                                    @{profile.username}
                                  </div>
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "12px",
                                  fontSize: "11px",
                                  color: "#e5e7eb",
                                }}
                              >
                                <span>
                                  <strong>
                                    {profile.follower_count}
                                  </strong>{" "}
                                  followers
                                </span>
                                <span>
                                  <strong>
                                    {profile.following_count}
                                  </strong>{" "}
                                  following
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Seen */}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {token.first_seen_at
                        ? formatDate(token.first_seen_at)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
