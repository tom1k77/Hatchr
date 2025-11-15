"use client";

import React, { useEffect, useMemo, useState } from "react";

// ==== Типы (должны совпадать с тем, что отдаёт /api/tokens) ====

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

  // будем дополнять их на клиенте
  farcaster_username?: string;
  farcaster_display_name?: string;
  farcaster_pfp_url?: string;
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

// простая иконка Farcaster (фиолетовый квадрат с «аркой», без F)
const FarcasterIcon: React.FC = () => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    style={{ display: "block", borderRadius: 6 }}
  >
    <rect x="0" y="0" width="24" height="24" rx="6" fill="#855DFF" />
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

// ====== Страница ======

export default function Page() {
  const [tokens, setTokens] = useState<TokenWithMarket[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">(
    "all"
  );
  const [minLiquidity, setMinLiquidity] = useState<string>("0");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // ---------- Загрузка токенов с мерджем маркет-данных ----------

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

          // Не затираем старые значения, если новые undefined
          return {
            ...t,
            price_usd: t.price_usd ?? old.price_usd,
            liquidity_usd: t.liquidity_usd ?? old.liquidity_usd,
            volume_24h: t.volume_24h ?? old.volume_24h,

            // сохраняем уже загруженные данные фаркастера
            farcaster_username: old.farcaster_username ?? t.farcaster_username,
            farcaster_display_name:
              old.farcaster_display_name ?? t.farcaster_display_name,
            farcaster_pfp_url: old.farcaster_pfp_url ?? t.farcaster_pfp_url,
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

  // ---------- Дозагрузка имени и аватара Farcaster создателя ----------

  useEffect(() => {
    // Берём максимум 25 уникальных юзернеймов за раз, чтобы не спамить API
    const seenUsernames = new Set<string>();
    const toLoad: { username: string; address: string }[] = [];

    for (const t of tokens) {
      const username = extractFarcasterUsername(t.farcaster_url);
      if (!username) continue;
      if (t.farcaster_display_name || t.farcaster_pfp_url) continue;
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
            data.result?.user || data.user || data; // на всякий случай разные форматы

          const displayName =
            user?.display_name || user?.username || username;
          const pfpUrl = user?.pfp?.url || user?.pfp_url;

          setTokens((prev) =>
            prev.map((t) =>
              t.token_address.toLowerCase() === address.toLowerCase()
                ? {
                    ...t,
                    farcaster_username: username,
                    farcaster_display_name: displayName,
                    farcaster_pfp_url: pfpUrl,
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

  // ---------- Фильтрация / поиск ----------

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

  // ---------- Рендер ----------

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
              const username =
                t.farcaster_username || extractFarcasterUsername(t.farcaster_url);

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

                  {/* Socials: Farcaster icon + аватарка и имя */}
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {t.farcaster_url && (
                        <a
                          href={t.farcaster_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Farcaster"
                          style={iconLinkStyle}
                        >
                          <FarcasterIcon />
                        </a>
                      )}

                      {(t.farcaster_display_name || username) && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {t.farcaster_pfp_url && (
                            <img
                              src={t.farcaster_pfp_url}
                              alt={t.farcaster_display_name || username || ""}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                objectFit: "cover",
                              }}
                            />
                          )}
                          <span style={{ fontSize: "11px" }}>
                            {t.farcaster_display_name || username}
                          </span>
                        </div>
                      )}
                    </div>
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
