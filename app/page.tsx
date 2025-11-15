"use client";

import { useEffect, useMemo, useState } from "react";

// --- тип токена с рынка ---
interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  liquidity_usd?: number;
  price_usd?: number;
  volume_24h?: number;
  website_url?: string;
  x_url?: string;
  farcaster_url?: string;
  telegram_url?: string;
  first_seen_at?: string;
}

// --- ИКОНКИ ---

const iconSize = 18;

function IconWebsite() {
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="#ffffff" stroke="#111827" strokeWidth="1.6" />
      <path
        d="M4.5 12h15M12 4.5c-2 2-3.3 4.6-3.3 7.5 0 2.9 1.3 5.5 3.3 7.5 2-2 3.3-4.6 3.3-7.5 0-2.9-1.3-5.5-3.3-7.5z"
        fill="none"
        stroke="#111827"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000000" />
      <path
        d="M8 7.5L15.5 16M15.5 7.5L8 16"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFarcaster() {
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#8b5cf6" />
      {/* арка-«мост» */}
      <path
        d="M7.5 16V11c0-2.2 1.8-4 4-4h1c2.2 0 4 1.8 4 4v5h-2.4v-3.4c0-1.3-0.8-2.3-2.1-2.3-1.3 0-2.1 1-2.1 2.3V16H7.5z"
        fill="#ffffff"
      />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="#0f9cf5" />
      <path
        d="M8 12.3l7.8-4.3c.2-.1.5.1.4.4l-1.4 7c-.1.3-.4.4-.7.2l-2.1-1.6-1.1 1.1c-.1.1-.3.1-.4 0l.2-2.4 4.3-3.9-5.4 3.2-2.3-.8c-.3-.1-.3-.5 0-.6z"
        fill="#ffffff"
      />
    </svg>
  );
}

// --- КОМПОНЕНТ СТРАНИЦЫ ---

export default function Home() {
  const [items, setItems] = useState<Token[]>([]);
  const [source, setSource] = useState("all");
  const [minLiq, setMinLiq] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch("/api/tokens")
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setItems(j.items || []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    };

    // первый запрос
    load();
    // автообновление каждые 10 секунд
    const id = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((i) => (source === "all" ? true : i.source === source))
      .filter((i) => (i.liquidity_usd || 0) >= minLiq)
      .filter((i) => {
        if (!q.trim()) return true;
        const hay = `${i.name || ""} ${i.symbol || ""} ${
          i.token_address || ""
        }`.toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      })
      .sort((a, b) => {
        const tA = a.first_seen_at ? new Date(a.first_seen_at).getTime() : 0;
        const tB = b.first_seen_at ? new Date(b.first_seen_at).getTime() : 0;
        return tB - tA;
      });
  }, [items, source, minLiq, q]);

  return (
    <main style={{ padding: 24, maxWidth: 1140, margin: "0 auto" }}>
      <h1 style={{ margin: "4px 0 12px" }}>New Base Tokens (Zora + Clanker)</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label>
          Source:{" "}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All</option>
            <option value="clanker">Clanker</option>
          </select>
        </label>

        <label>
          Min Liquidity (USD):{" "}
          <input
            type="number"
            min={0}
            step={50}
            value={minLiq}
            onChange={(e) => setMinLiq(Number(e.target.value) || 0)}
            style={{ width: 140 }}
          />
        </label>

        <input
          placeholder="Search name / symbol / address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: "6px 10px" }}
        />
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 10 }}>Name</th>
              <th style={{ padding: 10 }}>Address</th>
              <th style={{ padding: 10 }}>Source</th>
              <th style={{ padding: 10 }}>Liquidity</th>
              <th style={{ padding: 10 }}>Price</th>
              <th style={{ padding: 10 }}>Vol 24h</th>
              <th style={{ padding: 10 }}>Socials</th>
              <th style={{ padding: 10 }}>Seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const nameBlock = (
                <>
                  {t.name || "—"}
                  {t.symbol && t.symbol !== t.name && (
                    <>
                      {" "}
                      <small>{t.symbol}</small>
                    </>
                  )}
                </>
              );

              return (
                <tr key={t.token_address} style={{ borderTop: "1px solid #fafafa" }}>
                  {/* name → ссылка на Clanker */}
                  <td style={{ padding: 10 }}>
                    {t.source_url ? (
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        {nameBlock}
                      </a>
                    ) : (
                      nameBlock
                    )}
                  </td>

                  <td style={{ padding: 10 }}>
                    <a
                      href={`https://basescan.org/token/${t.token_address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.token_address.slice(0, 6)}…{t.token_address.slice(-4)}
                    </a>
                  </td>

                  <td style={{ padding: 10 }}>{t.source || "clanker"}</td>

                  <td style={{ padding: 10 }}>
                    {t.liquidity_usd != null
                      ? `$${Math.round(t.liquidity_usd).toLocaleString()}`
                      : "—"}
                  </td>

                  <td style={{ padding: 10 }}>
                    {t.price_usd != null ? `$${t.price_usd.toFixed(6)}` : "—"}
                  </td>

                  <td style={{ padding: 10 }}>
                    {t.volume_24h != null
                      ? `$${Math.round(t.volume_24h).toLocaleString()}`
                      : "—"}
                  </td>

                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.website_url && (
                        <a
                          href={t.website_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Website"
                        >
                          <IconWebsite />
                        </a>
                      )}
                      {t.x_url && (
                        <a
                          href={t.x_url}
                          target="_blank"
                          rel="noreferrer"
                          title="X"
                        >
                          <IconX />
                        </a>
                      )}
                      {t.farcaster_url && (
                        <a
                          href={t.farcaster_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Farcaster"
                        >
                          <IconFarcaster />
                        </a>
                      )}
                      {t.telegram_url && (
                        <a
                          href={t.telegram_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Telegram"
                        >
                          <IconTelegram />
                        </a>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: 10 }}>
                    {t.first_seen_at
                      ? new Date(t.first_seen_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!filtered.length && (
        <p style={{ marginTop: 16 }}>Пока пусто. Обнови страницу чуть позже.</p>
      )}
      <p style={{ marginTop: 8, color: "#888" }}>
        Показываются токены за последний час. Данные обновляются примерно каждые
        10 секунд.
      </p>
    </main>
  );
}
