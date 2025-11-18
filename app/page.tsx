"use client";

import { useEffect, useMemo, useState } from "react";

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

const REFRESH_INTERVAL_MS = 30_000;
const PAGE_SIZE = 20;

// ---------- форматирование чисел ----------
function formatNumber(value: number | null | undefined): string {
  // 0, null, NaN → показываем прочерк
  if (value == null || Number.isNaN(value) || value === 0) return "—";
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

function FarcasterFallbackIcon({ size = 24 }: { size?: number }) {
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
          width: inner * 0.7,
          height: inner * 0.75,
          borderRadius: 4,
          border: `${Math.max(2, inner * 0.18)}px solid #ffffff`,
          borderTopWidth: 0,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
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

  const [profiles, setProfiles] = useState<Record<string, FarcasterProfile>>(
    {}
  );
  const [profileLoading, setProfileLoading] = useState<
    Record<string, boolean>
  >({});

  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [hoveredTableRowKey, setHoveredTableRowKey] =
    useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ---------- загрузка токенов + кэш цифр ----------
  async function loadTokens() {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (!res.ok) throw new Error(`Tokens API error: ${res.status}`);

      const data: TokensResponse = await res.json();

      setTokens((prev) => {
        const prevMap = new Map(
          prev.map((t) => [t.token_address.toLowerCase(), t])
        );

        const merged = data.items.map((t) => {
          const key = t.token_address.toLowerCase();
          const old = prevMap.get(key);

          if (!old) return t;

          // если новое значение null / NaN / 0 — оставляем старое
          const keepNumber = (field: keyof TokenItem): number | null => {
            const newVal = t[field] as unknown as number | null;
            const oldVal = old[field] as unknown as number | null;
            if (
              newVal == null ||
              !Number.isFinite(newVal) ||
              newVal === 0
            ) {
              return oldVal ?? null;
            }
            return newVal;
          };

          return {
            ...t,
            market_cap_usd: keepNumber("market_cap_usd"),
            liquidity_usd: keepNumber("liquidity_usd"),
            volume_24h_usd: keepNumber("volume_24h_usd"),
            price_usd: keepNumber("price_usd"),
          };
        });

        return merged;
      });
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sourceFilter, minLiquidity, search]);

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

  const visibleTokens = useMemo(
    () => filteredTokens.slice(0, visibleCount),
    [filteredTokens, visibleCount]
  );

  // right column: только реально торгующиеся
  const liveFeed = useMemo(() => {
    const nonZero = filteredTokens.filter(
      (t) => (t.market_cap_usd ?? 0) > 0 || (t.volume_24h_usd ?? 0) > 0
    );
    const sorted = [...nonZero].sort((a, b) => {
      return (
        new Date(b.first_seen_at || "").getTime() -
        new Date(a.first_seen_at || "").getTime()
      );
    });
    return sorted.slice(0, 15);
  }, [filteredTokens]);

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

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        {/* top bar */}
        <div className="hatchr-topbar">
          <div className="hatchr-brand">
            <div className="hatchr-brand-logo-circle">
              <img
                src="/hatchr-logo.png"
                alt="Hatchr logo"
                className="hatchr-brand-logo-img"
              />
            </div>
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

        <div className="hatchr-main-grid">
          {/* левая колонка */}
          <section>
            {/* фильтры */}
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

            {error && <div className="hatchr-error">{error}</div>}

            {/* таблица */}
            <div className="hatchr-table-wrapper">
              <table className="hatchr-table">
                {/* фиксируем ширину колонок, чтобы левая часть не «ездила» */}
                <colgroup>
                  <col style={{ width: "26%" }} /> {/* Name */}
                  <col style={{ width: "16%" }} /> {/* Address */}
                  <col style={{ width: "10%" }} /> {/* Source */}
                  <col style={{ width: "14%" }} /> {/* MC */}
                  <col style={{ width: "14%" }} /> {/* Vol */}
                  <col style={{ width: "12%" }} /> {/* Socials */}
                  <col style={{ width: "8%" }} />  {/* Created */}
                </colgroup>

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
                          textAlign: h === "Name" ? "left" : "right",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTokens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="hatchr-table-empty">
                        {isLoading
                          ? "Loading Base mints…"
                          : "Nothing here yet. Try again in a minute."}
                      </td>
                    </tr>
                  )}

                  {visibleTokens.map((token) => {
                    const username = extractFarcasterUsername(
                      token.farcaster_url || undefined
                    );
                    const profile = username ? profiles[username] : undefined;

                    const rowKey = `${token.source}-${token.token_address}`;
                    const isTooltipVisible = hoveredRowKey === rowKey;
                    const isRowHovered = hoveredTableRowKey === rowKey;

                    const { time, date } = formatCreated(token.first_seen_at);

                    const fullAddress = token.token_address || "";
                    const shortAddress =
                      fullAddress.length > 4
                        ? `0x…${fullAddress.slice(-4)}`
                        : fullAddress;

                    return (
                      <tr
                        key={rowKey}
                        className={
                          "hatchr-table-row" + (isRowHovered ? " hovered" : "")
                        }
                        onMouseEnter={() => setHoveredTableRowKey(rowKey)}
                        onMouseLeave={() => setHoveredTableRowKey(null)}
                      >
                        {/* Name */}
                        <td className="hatchr-name-cell">
                          <a
                            href={token.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hatchr-name-link"
                          >
                            <span className="hatchr-name-main">
                              {token.name || token.symbol || "—"}
                            </span>
                            {token.symbol && (
                              <span className="hatchr-name-symbol-pill">
                                {token.symbol}
                              </span>
                            )}
                          </a>
                        </td>

                        {/* Address + copy-иконка */}
                        <td className="hatchr-address-cell">
                          <span className="hatchr-address-text">
                            {shortAddress || "—"}
                          </span>
                          {fullAddress && (
                            <button
                              type="button"
                              onClick={() =>
                                navigator.clipboard
                                  ?.writeText(fullAddress)
                                  .catch(() => {})
                              }
                              className="hatchr-copy-btn"
                              aria-label="Copy address"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <rect
                                  x="9"
                                  y="9"
                                  width="11"
                                  height="11"
                                  rx="2"
                                  stroke="#4b5563"
                                  strokeWidth="1.6"
                                />
                                <rect
                                  x="4"
                                  y="4"
                                  width="11"
                                  height="11"
                                  rx="2"
                                  stroke="#9ca3af"
                                  strokeWidth="1.6"
                                />
                              </svg>
                            </button>
                          )}
                        </td>

                        {/* Source */}
                        <td style={{ textAlign: "right", padding: "8px 10px" }}>
                          <span className="hatchr-source-pill">
                            {token.source}
                          </span>
                        </td>

                        {/* Market cap */}
                        <td style={{ textAlign: "right", padding: "8px 10px" }}>
                          {formatNumber(token.market_cap_usd)}
                        </td>

                        {/* Vol 24h */}
                        <td style={{ textAlign: "right", padding: "8px 10px" }}>
                          {formatNumber(token.volume_24h_usd)}
                        </td>

                        {/* Socials */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            position: "relative",
                          }}
                        >
                          {username ? (
                            <div
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
                                className="hatchr-social-pill"
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
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <FarcasterFallbackIcon size={24} />
                                )}

                                <span className="hatchr-social-username">
                                  @{username}
                                </span>
                              </a>

                              {isTooltipVisible && profile && (
                                <div className="hatchr-profile-tooltip">
                                  <div className="hatchr-profile-header">
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
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <FarcasterFallbackIcon size={26} />
                                    )}

                                    <div>
                                      <div className="hatchr-profile-name">
                                        {profile.display_name ||
                                          profile.username}
                                      </div>
                                      <div className="hatchr-profile-handle">
                                        @{profile.username}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="hatchr-profile-stats">
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

                        {/* Created */}
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontSize: 11,
                          }}
                        >
                          <div>{time}</div>
                          {date && (
                            <div style={{ color: "#9ca3af" }}>{date}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {filteredTokens.length > visibleCount && (
              <div style={{ marginTop: 10, textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((prev) => prev + PAGE_SIZE)
                  }
                  className="hatchr-load-more"
                >
                  Load more
                </button>
              </div>
            )}
          </section>

          {/* правая колонка — live traded feed */}
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
                    Soon: Base-wide stats &amp; creator leaderboards.
                  </span>
                </li>
              )}

              {liveFeed.map((t) => {
                const username = extractFarcasterUsername(
                  t.farcaster_url || undefined
                );

                return (
                  <li
                    key={t.token_address + (t.first_seen_at || "")}
                    className="hatchr-feed-item"
                  >
                    <div className="hatchr-feed-main">
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="token"
                        style={{ textDecoration: "none", color: "#111827" }}
                      >
                        {t.symbol || t.name || "New token"}
                      </a>
                      <span className="meta">
                        {formatTimeAgo(t.first_seen_at)}
                      </span>
                    </div>
                    <div className="hatchr-feed-sub">
                      🐣 {t.source === "clanker" ? "Clanker" : "Zora"} ·{" "}
                      {t.name || "Unnamed"}
                    </div>
                    <div className="hatchr-feed-sub">
                      MC: {formatNumber(t.market_cap_usd)} · Vol 24h:{" "}
                      {formatNumber(t.volume_24h_usd)}
                    </div>
                    {username && (
                      <div className="hatchr-feed-sub">
                        by{" "}
                        <a
                          href={`https://farcaster.xyz/${username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#4f46e5", textDecoration: "none" }}
                        >
                          @{username}
                        </a>
                      </div>
                    )}
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
