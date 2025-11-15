// app/page.tsx

"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadTokens() {
    try {
      const res = await fetch("/api/tokens");
      const data = await res.json();
      setTokens(data.items || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTokens();
    const interval = setInterval(loadTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h2>New Base Tokens (Zora + Clanker)</h2>
      <p>Auto-refresh every 30 seconds. Market data from DexScreener.</p>

      <table style={{ width: "100%", marginTop: 20 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Source</th>
            <th>Liquidity (USD)</th>
            <th>Price (USD)</th>
            <th>Vol 24h</th>
            <th>Socials</th>
            <th>Seen</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8}>Loading...</td>
            </tr>
          ) : tokens.length === 0 ? (
            <tr>
              <td colSpan={8}>Пока пусто. Обнови страницу позже.</td>
            </tr>
          ) : (
            tokens.map((t: any) => (
              <tr key={t.tokenAddress}>
                <td>{t.name} {t.symbol}</td>
                <td>{t.tokenAddress.slice(0, 6)}...{t.tokenAddress.slice(-4)}</td>
                <td>{t.source}</td>
                <td>{t.liquidityUsd ?? "-"}</td>
                <td>{t.priceUsd ?? "-"}</td>
                <td>{t.volume24hUsd ?? "-"}</td>

                <td>
                  {t.farcasterUrl ? (
                    <a
                      href={t.farcasterUrl}
                      target="_blank"
                      style={{
                        background: "#5c38ff",
                        color: "white",
                        padding: "4px 10px",
                        borderRadius: 6,
                      }}
                    >
                      F
                    </a>
                  ) : "-"}
                </td>

                <td>{t.firstSeenAt ? new Date(t.firstSeenAt).toLocaleString() : "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
