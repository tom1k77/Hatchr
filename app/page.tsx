"use client";

import { useEffect, useMemo, useState } from "react";

type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string;

  // важно: чтобы совпадало с тем, что отдаёт /api/tokens
  market_cap_usd: number | null;
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

const REFRESH_INTERVAL_MS = 30_000; // 30 секунд автообновление

// ---------- утилиты ----------

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) < 1) return value.toFixed(6);
  if (Math.abs(value) < 10) return value.toFixed(4);
  if (Math.abs(value) < 1_000) return value.toFixed(2);
  if (Math.abs(value) < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatDateWithTimeSplit(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { time: "—", date: "—" };

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

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const created = new Date(dateString).getTime();
  if (Number.isNaN(created)) return "";

  const diffMs = Date.now() - created;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
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

// fallback-иконка Farcaster (арка)
function FarcasterFallbackIcon({ size = 22 }: { size?: number }) {
  const inner = size - 6;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: "#5b3ded",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: inner * 0.66,
          height: inner * 0.72,
          borderRadius: 4,
          border: `${Math.max(2, inner * 0.18)}px solid #ffffff`,
          borderTopWidth: 0,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// --------- Мержим токены, чтобы не терять старые значения market cap / volume ---------

function mergeTokensByAddress(
  prev: TokenItem[],
  fresh: TokenItem[]
): TokenItem[] {
  const prevMap = new Map<string, TokenItem>();
  for (const t of prev) {
    const key = `${t.source}-${t.token_address}`;
    prevMap.set(key, t);
  }

  return fresh.map((t) => {
    const key = `${t.source}-${t.token_address}`;
    const old = prevMap.get(key);

    const newMarketCap =
      t.market_cap_usd && t.market_cap_usd > 0
        ? t.market_cap_usd
        : old?.market_cap_usd ?? t.market_cap_usd;

    const newVolume24h =
      t.volume_24h_usd && t.volume_24h_usd > 0
        ? t.volume_24h_usd
        : old?.volume_24h_usd ?? t.volume_24h_usd;

    return {
      ...(old || {}),
      ...t,
      market_cap_usd: newMarketCap,
      volume_24h_usd: newVolume24h,
    };
  });
}

// ---------- Компонент ----------

export default function HomePage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">(
    "all"
  );
  const [minLiquidity, setMinLiquidity] = useState<number>(0); // пока не используем, но оставим как есть
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Record<string, FarcasterProfile>>(
    {}
  );
  const [profileLoading, setProfileLoading] = useState<
    Record<string, boolean>
  >({});

  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [hoveredTableRowKey, setHoveredTableRowKey] = useState<string | null>(
    null
  );

  // ---- загрузка токенов ----
  async function loadTokens() {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (!res.ok) throw new Error(`Tokens API error: ${res.status}`);

      const data: TokensResponse = await res.json();
      const fresh = data.items || [];
      setTokens((prev) => mergeTokensByAddress(prev, fresh));
    } catch (e) {
      console.error(e);
      setError("Не удалось загрузить токены. Попробуй обновить страницу позже.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();
    const id = setInterval(loadTokens, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ---- фильтрация ----
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;

      if (minLiquidity > 0) {
        // сейчас ликвидность не тянем — но оставляю логику на будущее
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

  async function ensureProfile(username: string) {
    if (!username) return;
    if (profiles[username] || profileLoading[username]) return;

    setProfileLoading((prev) => ({ ...prev, [username]: true }));
    try {
      const res = await fetch(
        `/api/farcaster-profile?username=${encodeURIComponent(username)}`
      );
      if (!res.ok) return;
      const data: FarcasterProfile = await res.json();
      setProfiles((prev) => ({ ...prev, [username]: data }));
    } catch (e) {
      console.error("Profile fetch failed for", username, e);
    } finally {
      setProfileLoading((prev) => ({ ...prev, [username]: false }));
    }
  }

  // live-фид: токены с ненулевыми рын. метриками
  const liveFeed = useMemo(() => {
    const withMarkets = tokens.filter((t) => {
      const mc = t.market_cap_usd || 0;
      const vol = t.volume_24h_usd || 0;
      return mc > 0 || vol > 0;
    });

    const sorted = [...withMarkets].sort((a, b) => {
      return (
        new Date(b.first_seen_at).getTime() -
        new Date(a.first_seen_at).getTime()
      );
    });

    return sorted.slice(0, 15);
  }, [tokens]);

  // копирование адреса
  function handleCopyAddress(addr: string) {
    if (!addr) return;
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(addr).catch(() => {});
    }
  }

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        {/* Top bar */}
        <div className="hatchr-topbar">
          <div className="hatchr-brand">
            {/* пока оставим простую «H», отдельный логотип потом подключим через img */}
            <div className="hatchr-brand-logo">H</div>
            <div className="hatchr-brand-title">
              <span className="hatchr-brand-title-main">Hatchr</span>
              <span className="hatchr-brand-title-sub">
                New Base tokens. Farcaster-native.
              </span>
            </div>
          </div>

          <nav className="hatchr-nav">
            <span className="hatchr-nav-pill primary">New tokens</span>
            <span className="hatchr-nav-pill">Creators</span>
            <span className="hatchr-nav-pill">Trending</span>
            <span className="hatchr-nav-pill">API (soon)</span>
          </nav>
        </div>

        {/* grid: таблица + сайдбар */}
        <div className="hatchr-main-grid">
          {/* Левая часть */}
          <section>
            {/* Фильтры */}
            <section className="hatchr-filters">
              <div className="hatchr-filters-left">
                <label className="hatchr-label">
                  Source:
                  <select
                    value={sourceFilter}
                    onChange={(e) =>
                      setSourceFilter(
                        e.target.value as "all" | "clanker" | "zora"
                      )
                    }
                    className="hatchr-select"
                  >
                    <option value="all">All</option>
                    <option value="clanker">Clanker</option>
                    <option value="zora">Zora</option>
                  </select>
                </label>

                <label className="hatchr-label">
                  Min Liquidity (USD):
                  <input
                    type="number"
                    value={minLiquidity}
                    onChange={(e) =>
                      setMinLiquidity(Number(e.target.value) || 0)
                    }
                    className="hatchr-input-number"
                    style={{ width: 90 }}
                  />
                </label>
              </div>

              <div style={{ flex: "0 0 260px" }}>
                <input
                  type="text"
                  placeholder="Search name / symbol / address"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="hatchr-search"
                />
              </div>
            </section>

            {error && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  backgroundColor: "#fee2e2",
                  color: "#b91c1c",
                  fontSize: 12,
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            {/* Таблица */}
            <div className="hatchr-table-wrapper">
              <table className="hatchr-table">
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Address",
                      "Source",
                      "Market Cap",
                      "Vol 24h",
                      "Socials",
                      "Created",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign:
                            h === "Name" || h === "Socials"
                              ? "left"
                              : "right",
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
                      <td colSpan={7} className="hatchr-table-empty">
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

                    const rowKey = `${token.source}-${token.token_address}`;
                    const isTooltipVisible = hoveredRowKey === rowKey;
                    const isRowHovered = hoveredTableRowKey === rowKey;

                    const { time, date } = formatDateWithTimeSplit(
                      token.first_seen_at
                    );

                    const shortAddr =
                      token.token_address && token.token_address.length > 8
                        ? `0x…${token.token_address.slice(-4)}`
                        : token.token_address || "—";

                    return (
                      <tr
                        key={rowKey}
                        className={
                          "hatchr-table-row" + (isRowHovered ? " hovered" : "")
                        }
                        onMouseEnter={() => setHoveredTableRowKey(rowKey)}
                        onMouseLeave={() => setHoveredTableRowKey(null)}
                      >
                        {/* Name (фиксированная ширина + до 2 строк) */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            width: 260,
                            maxWidth: 260,
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
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                lineHeight: 1.25,
                              } as any}
                            >
                              {token.name || token.symbol || "—"}
                            </span>
                            {token.symbol && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                  textTransform: "uppercase",
                                }}
                              >
                                {token.symbol}
                              </span>
                            )}
                          </a>
                        </td>

                        {/* Address + иконка копирования */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                            fontSize: 12,
                          }}
                        >
                          <span>{shortAddr}</span>
                          {token.token_address && (
                            <button
                              onClick={() =>
                                handleCopyAddress(token.token_address)
                              }
                              style={{
                                marginLeft: 6,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                fontSize: 12,
                                opacity: 0.75,
                              }}
                              title="Copy address"
                            >
                              ⧉
                            </button>
                          )}
                        </td>

                        {/* Source */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                          }}
                        >
                          <span className="hatchr-source-pill">
                            {token.source}
                          </span>
                        </td>

                        {/* Market Cap */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                          }}
                        >
                          {formatNumber(token.market_cap_usd)}
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

                        {/* Socials */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            position: "relative",
                          }}
                        >
                          {username ? (
                            <div
                              className="hatchr-social-pill"
                              onMouseEnter={() => {
                                setHoveredRowKey(rowKey);
                                ensureProfile(username);
                              }}
                              onMouseLeave={() => setHoveredRowKey(null)}
                            >
                              <a
                                href={`https://farcaster.xyz/${username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 7,
                                  padding: "4px 11px",
                                  borderRadius: 999,
                                  backgroundColor: "#5b3ded",
                                  color: "#fff",
                                  textDecoration: "none",
                                  fontSize: 12,
                                }}
                              >
                                {profile?.pfp_url ? (
                                  <img
                                    src={profile.pfp_url}
                                    alt={profile.display_name || username}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 999,
                                      objectFit: "cover",
                                      backgroundColor: "#1f2933",
                                    }}
                                  />
                                ) : (
                                  <FarcasterFallbackIcon size={24} />
                                )}

                                <span
                                  style={{
                                    maxWidth: 110,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  @{username}
                                </span>
                              </a>

                              {isTooltipVisible && profile && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "112%",
                                    left: 0,
                                    marginTop: 6,
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    backgroundColor: "#111827",
                                    color: "#f9fafb",
                                    minWidth: 220,
                                    boxShadow:
                                      "0 14px 36px rgba(0,0,0,0.45)",
                                    zIndex: 20,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      marginBottom: 8,
                                    }}
                                  >
                                    {profile.pfp_url ? (
                                      <img
                                        src={profile.pfp_url}
                                        alt={
                                          profile.display_name || username
                                        }
                                        style={{
                                          width: 40,
                                          height: 40,
                                          borderRadius: 999,
                                          objectFit: "cover",
                                          backgroundColor: "#1f2933",
                                        }}
                                      />
                                    ) : (
                                      <FarcasterFallbackIcon size={26} />
                                    )}

                                    <div>
                                      <div
                                        style={{
                                          fontSize: 13,
                                          fontWeight: 600,
                                          marginBottom: 2,
                                        }}
                                      >
                                        {profile.display_name ||
                                          profile.username}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 12,
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
                                      gap: 12,
                                      fontSize: 11,
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

                        {/* Created: время над датой */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontSize: 12,
                          }}
                        >
                          <div>{time}</div>
                          <div style={{ color: "#6b7280", fontSize: 11 }}>
                            {date}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Правая часть: live traded feed */}
          <aside className="hatchr-feed">
            <div className="hatchr-feed-title">
              <span>Live traded feed</span>
              <span className="hatchr-feed-badge">non-zero markets</span>
            </div>
            <ul className="hatchr-feed-list">
              {liveFeed.length === 0 && (
                <li className="hatchr-feed-item">
                  <span className="hatchr-feed-sub">
                    Waiting for the first trades on fresh tokens…
                  </span>
                  <span className="hatchr-feed-sub">
                    Soon: Base-wide stats & creator leaderboards.
                  </span>
                </li>
              )}

              {liveFeed.map((t) => {
                const username = extractFarcasterUsername(
                  t.farcaster_url || undefined
                );
                const { timeAgo, mc, vol } = {
                  timeAgo: formatTimeAgo(t.first_seen_at),
                  mc: t.market_cap_usd || 0,
                  vol: t.volume_24h_usd || 0,
                };

                return (
                  <li
                    key={t.token_address + t.first_seen_at}
                    className="hatchr-feed-item"
                  >
                    <div className="hatchr-feed-main">
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="token-link"
                      >
                        {t.symbol || t.name || "New token"}
                      </a>
                      <span className="meta">{timeAgo}</span>
                    </div>
                    <div className="hatchr-feed-sub">
                      🐣{" "}
                      {t.source === "clanker" ? "Clanker" : "Zora"} ·{" "}
                      {t.name || "Unnamed"}
                    </div>
                    <div className="hatchr-feed-sub">
                      MC: {formatNumber(mc)} · Vol 24h: {formatNumber(vol)}{" "}
                      {username && (
                        <>
                          ·{" "}
                          <a
                            href={`https://farcaster.xyz/${username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="creator-link"
                          >
                            @{username}
                          </a>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
