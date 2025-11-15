"use client";

import React, { useEffect, useMemo, useState } from "react";

// ==== Типы данных ====

interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;

  farcaster_url?: string;
  website_url?: string;
  x_url?: string;
  telegram_url?: string;

  // Дополняем на клиенте
  farcaster_username?: string;
  farcaster_display_name?: string;
  farcaster_pfp_url?: string;
  farcaster_followers?: number;
  farcaster_following?: number;
}

interface TokenWithMarket extends Token {
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h?: number;
}

interface ApiResponse {
  count: number;
  items: TokenWithMarket[];
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "clanker", label: "Clanker" },
  { value: "zora", label: "Zora" },
];

// ===== Утилиты =====

const formatNumber = (value?: number, decimals = 2) => {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU");
};

const shortAddress = (addr: string) => {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
};

const extractFarcasterUsername = (url?: string) => {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("farcaster.xyz")) return undefined;
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[0] || undefined;
  } catch {
    return undefined;
  }
};

// ipfs://… -> https://ipfs.io/ipfs/…
const normalizePfpUrl = (url?: string) => {
  if (!url) return undefined;
  if (url.startsWith("ipfs://")) {
    const hash = url.slice("ipfs://".length);
    return `https://ipfs.io/ipfs/${hash}`;
  }
  return url;
};

// простая иконка Farcaster (фоллбек)
const FarcasterIcon: React.FC = () => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    style={{ display: "block", borderRadius: 8 }}
  >
    <rect x="0" y="0" width="24" height="24" rx="8" fill="#855DFF" />
    <path
      d="M7 17V12.5C7 9.5 8.8 8 12 8s5 1.5 5 4.5V17"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// ====== Стили таблицы ======

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 500,
  fontSize: "12px",
  color: "#4b5563",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "middle",
};

const iconLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

// ===== Hover-карточка профиля Farcaster =====

interface FarcasterProfileBadgeProps {
  url: string;
  displayName?: string;
  usernameLabel?: string; // @username
  pfpUrl?: string;
  followers?: number;
  following?: number;
}

const tooltipStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(17, 24, 39, 0.98)",
  color: "white",
  fontSize: "11px",
  whiteSpace: "nowrap",
  zIndex: 20,
  boxShadow:
    "0 20px 25px -5px rgba(0,0,0,0.4), 0 10px 10px -5px rgba(0,0,0,0.3)",
  minWidth: 220,
};

const FarcasterProfileBadge: React.FC<FarcasterProfileBadgeProps> = ({
  url,
  displayName,
  usernameLabel,
  pfpUrl,
  followers,
  following,
}) => {
  const [hover, setHover] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        ...iconLinkStyle,
        gap: 6,
        alignItems: "center",
        position: "relative",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* маленький вид в таблице */}
      {pfpUrl ? (
        <img
          src={pfpUrl}
          alt={displayName || "Farcaster user"}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <FarcasterIcon />
      )}

      {displayName && (
        <span style={{ fontSize: "11px" }}>{displayName}</span>
      )}

      {/* всплывающее окно как мини-профиль */}
      {hover && (
        <div style={tooltipStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div>
              {pfpUrl ? (
                <img
                  src={pfpUrl}
                  alt={displayName || "Farcaster user"}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <FarcasterIcon />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                {displayName || "Farcaster user"}
              </span>
              {usernameLabel && (
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  {usernameLabel}
                </span>
              )}
            </div>
          </div>

          {(followers !== undefined || following !== undefined) && (
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 11,
                opacity: 0.9,
              }}
            >
              {following !== undefined && (
                <span>
                  <strong>{following.toLocaleString()}</strong> Following
                </span>
              )}
              {followers !== undefined && (
                <span>
                  <strong>{followers.toLocaleString()}</strong> Followers
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </a>
  );
};

// ====== Страница ======

export default function Page() {
  const [tokens, setTokens] = useState<TokenWithMarket[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">(
    "all"
  );
  const [minLiquidity, setMinLiquidity] = useState<string>("0");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // ---------- загрузка токенов + мердж маркет-данных ----------

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tokens");
      if (!res.ok) throw new Error("Failed to load /api/tokens");
      const data: ApiResponse = await res.json();
      const fresh: TokenWithMarket[] = data.items ?? [];

      setTokens((prev) => {
        const prevMap = new Map<string, TokenWithMarket>(
          prev.map((t) => [t.token_address.toLowerCase(), t])
        );

        const merged: TokenWithMarket[] = fresh.map((t) => {
          const key = t.token_address.toLowerCase();
          const old = prevMap.get(key);

          if (!old) return t;

          return {
            ...t,
            // не стираем старые значения, если новые undefined
            price_usd: t.price_usd ?? old.price_usd,
            liquidity_usd: t.liquidity_usd ?? old.liquidity_usd,
            volume_24h: t.volume_24h ?? old.volume_24h,

            farcaster_username: old.farcaster_username ?? t.farcaster_username,
            farcaster_display_name:
              old.farcaster_display_name ?? t.farcaster_display_name,
            farcaster_pfp_url: old.farcaster_pfp_url ?? t.farcaster_pfp_url,
            farcaster_followers:
              old.farcaster_followers ?? t.farcaster_followers,
            farcaster_following:
              old.farcaster_following ?? t.farcaster_following,
          };
        });

        return merged;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // автообновление раз в 30 сек
    return () => clearInterval(id);
  }, []);

  // ---------- дозагрузка профилей Farcaster ----------

  useEffect(() => {
    const seenUsernames = new Set<string>();
    const toLoad: { username: string; address: string }[] = [];

    for (const t of tokens) {
      const username = extractFarcasterUsername(t.farcaster_url);
      if (!username) continue;

      // если у нас уже есть какие-то данные — не трогаем
      if (
        t.farcaster_display_name ||
        t.farcaster_pfp_url ||
        t.farcaster_followers !== undefined ||
        t.farcaster_following !== undefined
      ) {
        continue;
      }

      if (seenUsernames.has(username)) continue;
      seenUsernames.add(username);
      toLoad.push({ username, address: t.token_address });
    }

    const limited = toLoad.slice(0, 25);
    if (!limited.length) return;

    limited.forEach(({ username, address }) => {
      (async () => {
        try {
          const url = `https://client.farcaster.xyz/v2/user-by-username?username=${encodeURIComponent(
            username
          )}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          const user =
            data.result?.user || data.user || data; // возможные форматы

          const displayName =
            user?.display_name || user?.username || username;
          const rawPfp = user?.pfp?.url || user?.pfp_url;
          const pfpUrl = normalizePfpUrl(rawPfp);

          const followers: number | undefined =
            user?.follower_count ??
            user?.followers ??
            user?.followers_count ??
            undefined;

          const following: number | undefined =
            user?.following_count ??
            user?.following ??
            user?.following_users ??
            undefined;

          setTokens((prev) =>
            prev.map((t) =>
              t.token_address.toLowerCase() === address.toLowerCase()
                ? {
                    ...t,
                    farcaster_username: username,
                    farcaster_display_name: displayName,
                    farcaster_pfp_url: pfpUrl,
                    farcaster_followers: followers,
                    farcaster_following: following,
                  }
                : t
            )
          );
        } catch (e) {
          console.error("farcaster profile error", e);
        }
      })();
    });
  }, [tokens]);

  // ---------- фильтр / поиск ----------

  const filteredTokens = useMemo(() => {
    const minLiq = Number(minLiquidity) || 0;
    const q = search.trim().toLowerCase();

    return tokens.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;

      const liq = t.liquidity_usd ?? 0;
      if (liq < minLiq) return false;

      if (q) {
        const inName = (t.name || "").toLowerCase().includes(q);
        const inSymbol = (t.symbol || "").toLowerCase().includes(q);
        const inAddress = t.token_address.toLowerCase().includes(q);
        if (!inName && !inSymbol && !inAddress) return false;
      }

      return true;
    });
  }, [tokens, sourceFilter, minLiquidity, search]);

  // ---------- рендер ----------

  return (
    <main
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px 16px 40px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      <header style={{ marginBottom: "16px" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 600,
            margin: 0,
            marginBottom: "4px",
          }}
        >
          New Base Tokens (Zora + Clanker)
        </h1>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.7 }}>
          Auto-refresh every 30 seconds. Market data from DexScreener.
        </p>
      </header>

      {/* Панель фильтров */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <label style={{ fontSize: "13px" }}>
          Source:&nbsp;
          <select
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as "all" | "clanker" | "zora")
            }
            style={{ fontSize: "13px", padding: "4px 6px" }}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: "13px" }}>
          Min Liquidity (USD):&nbsp;
          <input
            type="number"
            min={0}
            value={minLiquidity}
            onChange={(e) => setMinLiquidity(e.target.value)}
            style={{ fontSize: "13px", padding: "4px 6px", width: "100px" }}
          />
        </label>

        <div style={{ flex: 1, minWidth: "220px", textAlign: "right" }}>
          <input
            type="text"
            placeholder="Search name / symbol / address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "260px",
              fontSize: "13px",
              padding: "4px 8px",
            }}
          />
        </div>
      </section>

      {/* Таблица */}
      <section
        style={{
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >
          <thead
            style={{
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Address</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Liquidity</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Vol 24h</th>
              <th style={thStyle}>Socials</th>
              <th style={thStyle}>Seen</th>
            </tr>
          </thead>
          <tbody>
            {filteredTokens.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "16px",
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: "13px",
                  }}
                >
                  Пока пусто. Обнови страницу позже.
                </td>
              </tr>
            )}

            {filteredTokens.map((t) => {
              const usernameRaw =
                t.farcaster_username || extractFarcasterUsername(t.farcaster_url);
              const username = usernameRaw
                ? usernameRaw.replace(/^@/, "")
                : undefined;
              const usernameLabel = username ? `@${username}` : undefined;
              const displayName = t.farcaster_display_name || usernameLabel;

              const hasAnyProfileInfo =
                (t.farcaster_pfp_url || displayName) && t.farcaster_url;

              return (
                <tr key={t.token_address}>
                  {/* Name + symbol (кликабельно на Clanker/Zora) */}
                  <td style={tdStyle}>
                    {t.source_url ? (
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          textDecoration: "none",
                          color: "#111827",
                        }}
                      >
                        <div>{t.name || "—"}</div>
                        {t.symbol && (
                          <div style={{ opacity: 0.6, fontSize: "11px" }}>
                            {t.symbol}
                          </div>
                        )}
                      </a>
                    ) : (
                      <div>
                        <div>{t.name || "—"}</div>
                        {t.symbol && (
                          <div style={{ opacity: 0.6, fontSize: "11px" }}>
                            {t.symbol}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Address */}
                  <td style={tdStyle}>
                    <code>{shortAddress(t.token_address)}</code>
                  </td>

                  {/* Source */}
                  <td style={tdStyle}>{t.source || "—"}</td>

                  {/* Liquidity */}
                  <td style={tdStyle}>
                    {t.liquidity_usd !== undefined
                      ? `$${formatNumber(t.liquidity_usd, 0)}`
                      : "—"}
                  </td>

                  {/* Price */}
                  <td style={tdStyle}>
                    {t.price_usd !== undefined
                      ? `$${formatNumber(t.price_usd, 6)}`
                      : "—"}
                  </td>

                  {/* Volume 24h */}
                  <td style={tdStyle}>
                    {t.volume_24h !== undefined
                      ? `$${formatNumber(t.volume_24h, 0)}`
                      : "—"}
                  </td>

                  {/* Socials: аватар Farcaster или иконка */}
                  <td style={tdStyle}>
                    {t.farcaster_url && hasAnyProfileInfo && (
                      <FarcasterProfileBadge
                        url={t.farcaster_url}
                        displayName={displayName}
                        usernameLabel={usernameLabel}
                        pfpUrl={t.farcaster_pfp_url}
                        followers={t.farcaster_followers}
                        following={t.farcaster_following}
                      />
                    )}

                    {/* Фоллбек: ссылка есть, но профиля нет */}
                    {t.farcaster_url && !hasAnyProfileInfo && (
                      <a
                        href={t.farcaster_url}
                        target="_blank"
                        rel="noreferrer"
                        style={iconLinkStyle}
                        title="Farcaster"
                      >
                        <FarcasterIcon />
                      </a>
                    )}
                  </td>

                  {/* Seen */}
                  <td style={tdStyle}>{formatDateTime(t.first_seen_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {loading && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "11px",
            opacity: 0.6,
          }}
        >
          Updating…
        </div>
      )}
    </main>
  );
}
