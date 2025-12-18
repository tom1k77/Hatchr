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

  const minScore = process.env.NEXT_PUBLIC_NEYNAR_MIN_SCORE ?? "0.7";

  return (
    <section className="token-page-card social-signals-card" style={{ marginTop: 16 }}>
      <div className="social-signals-head">
        <div>
          <div className="token-page-label">Social signals</div>
          <div className="social-signals-subtitle">
            Real-time Farcaster posts mentioning token tickers ($TICKER) or contracts. Filter: Neynar score ≥ {minScore}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No signals yet.</div>
        ) : (
          <div className="social-signals-list">
            {items.map((it) => (
              <article key={it.cast_hash} className="signal-card">
                <div className="signal-head">
                  {it.author_pfp_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.author_pfp_url}
                      alt=""
                      width={32}
                      height={32}
                      className="signal-avatar"
                    />
                  ) : (
                    <div className="signal-avatar-fallback" />
                  )}

                  <div className="signal-meta">
                    <div className="signal-title-row">
                      <div className="signal-name">
                        {it.author_display_name || it.author_username || "Unknown"}
                      </div>

                      {it.author_username ? (
                        <div className="signal-username">@{it.author_username}</div>
                      ) : null}

                      {typeof it.author_score === "number" ? (
                        <div className="signal-score">score {it.author_score.toFixed(2)}</div>
                      ) : null}

                      {it.cast_timestamp ? (
                        <div className="signal-time">
                          {new Date(it.cast_timestamp).toLocaleString()}
                        </div>
                      ) : null}
                    </div>

                    {it.text ? (
                      <div className="signal-text">
                        {it.text}
                      </div>
                    ) : null}

                    <div className="signal-footer">
                      <div className="signal-tags">
                        {(it.tickers ?? []).slice(0, 8).map((t) => (
                          <span key={t} className="signal-tag">
                            {t}
                          </span>
                        ))}
                        {(it.contracts ?? []).slice(0, 3).map((c) => (
                          <span key={c} className="signal-tag">
                            {c.slice(0, 6)}…{c.slice(-4)}
                          </span>
                        ))}
                      </div>

                      {it.warpcast_url ? (
                        <a
                          href={it.warpcast_url}
                          target="_blank"
                          rel="noreferrer"
                          className="signal-link"
                        >
                          Open on Warpcast
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* локальные стили — только для Social signals, чтобы не трогать остальной сайт */}
      <style jsx>{`
        .social-signals-card {
          max-width: 860px;
          margin-left: auto;
          margin-right: auto;
        }

        .social-signals-subtitle {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
          line-height: 1.35;
        }

        .social-signals-list {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr; /* mobile */
}

@media (min-width: 780px) {
  .social-signals-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1100px) {
  .social-signals-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* опционально для очень широких */
@media (min-width: 1500px) {
  .social-signals-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.signal-card {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  border-radius: 14px;
  padding: 12px;
  padding-top: 12px;   /* убираем эффект "списка" */
}

/* убери линию-разделитель сверху (раньше было border-top) */

        .signal-head {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .signal-avatar {
          border-radius: 999px;
          margin-top: 2px;
          object-fit: cover;
          flex: 0 0 auto;
        }

        .signal-avatar-fallback {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          margin-top: 2px;
          background: rgba(255, 255, 255, 0.08);
          flex: 0 0 auto;
        }

        /* КЛЮЧЕВОЕ: min-width:0 чтобы текст не раздвигал flex-контейнер */
        .signal-meta {
          flex: 1;
          min-width: 0;
        }

        .signal-title-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: baseline;
          min-width: 0;
        }

        .signal-name {
          font-weight: 700;
        }

        .signal-username {
          opacity: 0.75;
          white-space: nowrap;
        }

        .signal-score {
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
        }

        .signal-time {
          font-size: 12px;
          opacity: 0.6;
          white-space: nowrap;
        }

        /* КЛЮЧЕВОЕ: переносим любые длинные куски (хэши/ссылки), чтобы не "уезжало" */
        .signal-text {
          margin-top: 6px;
          white-space: pre-wrap;
          line-height: 1.35;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .signal-footer {
          margin-top: 8px;
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .signal-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
        }

        .signal-tag {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          max-width: 100%;
        }

        .signal-link {
          font-size: 12px;
          opacity: 0.9;
          text-decoration: underline;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        @media (max-width: 520px) {
          .social-signals-card {
            max-width: 100%;
          }
          .signal-link {
            margin-left: 0;
          }
          .signal-username {
            max-width: 50vw;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      `}</style>
    </section>
  );
}
