"use client";

import { useEffect, useMemo, useState } from "react";

// Типы такие же, как в lib/providers.ts
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

export default function Page() {
  const [tokens, setTokens] = useState<TokenWithMarket[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">(
    "all"
  );
  const [minLiquidity, setMinLiquidity] = useState<string>("0");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // ---------- Загрузка с мерджем старых маркет-данных ----------

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tokens");
      if (!res.ok) throw new Error("Failed to load /api/tokens");
      const data: ApiResponse = await res.json();
      const fresh: TokenWithMarket[] = data.items ?? [];

      setTokens((prev) => {
        // карта старых токенов по адресу
        const prevMap = new Map<string, TokenWithMarket>(
          prev.map((t) => [t.token_address.toLowerCase(), t])
        );

        const merged: TokenWithMarket[] = fresh.map((t) => {
          const key = t.token_address.toLowerCase();
          const old = prevMap.get(key);

          if (!old) {
            // новый токен — просто берём как есть
            return t;
          }

          // если в новом ответе поле undefined, но в старом было значение —
          // сохраняем старое (чтобы цена/ликвидность/объём не пропадали)
          return {
            ...t,
            price_usd: t.price_usd ?? old.price_usd,
            liquidity_usd: t.liquidity_usd ?? old.liquidity_usd,
            volume_24h: t.volume_24h ?? old.volume_24h,
          };
        });

        return merged;
      });
    } catch (e) {
      console.error(e);
      // при ошибке просто оставляем старые данные
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // автообновление раз в 30 секунд (можно поменять на 60, если захочешь)
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

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

  // ---------- Утилиты отображения ----------

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

            {filteredTokens.map((t) => (
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

                {/* Socials */}
                <td style={tdStyle}>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
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
                        {/* простая «фиолетовая плитка» под Farcaster */}
                        <span
                          style={{
                            display: "inline-block",
                            width: "18px",
                            height: "18px",
                            borderRadius: "4px",
                            background: "#855DFF",
                            color: "white",
                            fontSize: "12px",
                            fontWeight: 700,
                            lineHeight: "18px",
                            textAlign: "center",
                          }}
                        >
                          F
                        </span>
                      </a>
                    )}

                    {t.website_url && (
                      <a
                        href={t.website_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Website"
                        style={iconLinkStyle}
                      >
                        🌐
                      </a>
                    )}

                    {t.x_url && (
                      <a
                        href={t.x_url}
                        target="_blank"
                        rel="noreferrer"
                        title="X (Twitter)"
                        style={iconLinkStyle}
                      >
                        𝕏
                      </a>
                    )}

                    {t.telegram_url && (
                      <a
                        href={t.telegram_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Telegram"
                        style={iconLinkStyle}
                      >
                        ✈️
                      </a>
                    )}
                  </div>
                </td>

                {/* Seen */}
                <td style={tdStyle}>{formatDateTime(t.first_seen_at)}</td>
              </tr>
            ))}
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

// Общие стили ячеек

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
  fontSize: "14px",
};
