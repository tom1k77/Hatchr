"use client";

import { useEffect, useMemo, useState } from "react";

export default function Home() {
  const [items, setItems] = useState([]);
  const [source, setSource] = useState("all"); // all | zora | clanker
  const [minLiq, setMinLiq] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((j) => setItems(j.items || []))
      .catch(() => setItems([]));
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
            <option value="zora">Zora</option>
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
              <th style={{ padding: 10 }}>Creator</th>
              <th style={{ padding: 10 }}>Socials</th>
              <th style={{ padding: 10 }}>Seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.token_address} style={{ borderTop: "1px solid #fafafa" }}>
                <td style={{ padding: 10 }}>
                  <div>
                    {t.name || "—"} <small>{t.symbol}</small>
                  </div>
                </td>
                <td style={{ padding: 10 }}>
                  <a
                    href={`https://basescan.org/token/${t.token_address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t.token_address?.slice(0, 6)}…{t.token_address?.slice(-4)}
                  </a>
                </td>
                <td style={{ padding: 10 }}>
                  {t.source_url ? (
                    <a href={t.source_url} target="_blank" rel="noreferrer">
                      {t.source}
                    </a>
                  ) : (
                    t.source
                  )}
                </td>
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
                  {t.creator_address ? (
                    <a
                      href={`https://basescan.org/address/${t.creator_address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.creator_address.slice(0, 6)}…
                      {t.creator_address.slice(-4)}
                    </a>
                  ) : (
                    "—"
                  )}
                  {t.creator_fid && (
                    <div>
                      FID:{" "}
                      <a
                        href={`https://warpcast.com/~/profiles/${t.creator_fid}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.creator_fid}
                      </a>
                      {t.creator_username ? ` (@${t.creator_username})` : null}
                    </div>
                  )}
                </td>
                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.website_url && (
                      <a href={t.website_url} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                    {t.x_url && (
                      <a href={t.x_url} target="_blank" rel="noreferrer">
                        X
                      </a>
                    )}
                    {t.farcaster_url && (
                      <a href={t.farcaster_url} target="_blank" rel="noreferrer">
                        Farcaster
                      </a>
                    )}
                    {t.telegram_url && (
                      <a href={t.telegram_url} target="_blank" rel="noreferrer">
                        Telegram
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
            ))}
          </tbody>
        </table>
      </div>

      {!filtered.length && (
        <p style={{ marginTop: 16 }}>Пока пусто. Обнови страницу чуть позже.</p>
      )}
      <p style={{ marginTop: 8, color: "#888" }}>
        Обновляется каждые ~2 минуты (CDN кэш).
      </p>
    </main>
  );
}
