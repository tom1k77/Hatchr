"use client";

import { useEffect, useState } from "react";

type Item = {
  cast_hash: string;
  cast_timestamp: string | null;
  warpcast_url: string | null;
  text: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_pfp_url: string | null;
  author_score: number | null;
  tickers: string[];
  contracts: string[];
};

export function SocialSignalsSection() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/social-signals?limit=25", { cache: "no-store" });
        const j = await r.json();
        if (alive) setItems(j.items ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="token-page-card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="token-page-label">Social signals</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Real-time Farcaster posts mentioning token tickers ($TICKER) or contracts. Filter: Neynar score ≥ {process.env.NEXT_PUBLIC_NEYNAR_MIN_SCORE ?? "0.7"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No signals yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it) => (
              <div key={it.cast_hash} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {it.author_pfp_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.author_pfp_url}
                      alt=""
                      width={28}
                      height={28}
                      style={{ borderRadius: 999, marginTop: 2 }}
                    />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.08)" }} />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>
                        {it.author_display_name || it.author_username || "Unknown"}
                      </div>
                      {it.author_username ? (
                        <div style={{ opacity: 0.75 }}>@{it.author_username}</div>
                      ) : null}
                      {typeof it.author_score === "number" ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          score {it.author_score.toFixed(2)}
                        </div>
                      ) : null}
                      {it.cast_timestamp ? (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>
                          {new Date(it.cast_timestamp).toLocaleString()}
                        </div>
                      ) : null}
                    </div>

                    {it.text ? (
                      <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                        {it.text}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(it.tickers ?? []).slice(0, 8).map((t) => (
                        <span key={t} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                          {t}
                        </span>
                      ))}
                      {(it.contracts ?? []).slice(0, 3).map((c) => (
                        <span key={c} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                          {c.slice(0, 6)}…{c.slice(-4)}
                        </span>
                      ))}
                      {it.warpcast_url ? (
                        <a
                          href={it.warpcast_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: "auto", fontSize: 12, opacity: 0.9, textDecoration: "underline" }}
                        >
                          Open on Warpcast
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
