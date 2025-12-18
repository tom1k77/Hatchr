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

  // раскрытие “простыней”
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = (hash: string) =>
    setExpanded((p) => ({ ...p, [hash]: !p[hash] }));

  useEffect(() => {
  let alive = true;
  let timer: number | null = null;

  const load = async (silent = false) => {
    try {
      if (!silent && alive) setLoading(true);

      const r = await fetch("/api/social-signals?limit=100", {
        cache: "no-store",
      });
      const j = await r.json();

      if (alive) setItems(j.items ?? []);
    } catch (e) {
      // ничего не делаем, чтобы не ломать UI
    } finally {
      if (!silent && alive) setLoading(false);
    }
  };

  // первый запрос
  load(false);

  // автообновление каждые 12 секунд
  timer = window.setInterval(() => {
    load(true); // silent — без лоадера
  }, 12000);

  return () => {
    alive = false;
    if (timer) window.clearInterval(timer);
  };
}, []);

  const minScore = process.env.NEXT_PUBLIC_NEYNAR_MIN_SCORE ?? "0.7";

  const needsClamp = (text: string | null | undefined) => {
    if (!text) return false;
    return text.length > 280 || text.split("\n").length > 6;
  };

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
            {items.map((it) => {
              const isOpen = !!expanded[it.cast_hash];
              const shouldShowToggle = needsClamp(it.text);

              return (
                <article key={it.cast_hash} className="signal-card">
                  {/* левый блок (аватар+имя) */}
                  <div className="signal-left">
                    {it.author_pfp_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.author_pfp_url}
                        alt=""
                        width={38}
                        height={38}
                        className="signal-avatar"
                      />
                    ) : (
                      <div className="signal-avatar-fallback" />
                    )}

                    <div className="signal-who">
                      <div className="signal-name">
                        {it.author_display_name || it.author_username || "Unknown"}
                      </div>

                      <div className="signal-who-row">
                        {it.author_username ? (
                          <span className="signal-username">@{it.author_username}</span>
                        ) : null}

                        {typeof it.author_score === "number" ? (
                          <span className="signal-score">score {it.author_score.toFixed(2)}</span>
                        ) : null}
                      </div>

                      {it.cast_timestamp ? (
                        <div className="signal-time">
                          {new Date(it.cast_timestamp).toLocaleString()}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* правый блок (контент) */}
                  <div className="signal-right">
                    {it.text ? (
                      <div className={`signal-text ${!isOpen ? "clamp" : ""}`}>
                        {it.text}
                      </div>
                    ) : null}

                    {shouldShowToggle ? (
                      <button
                        type="button"
                        className="signal-more"
                        onClick={() => toggleExpanded(it.cast_hash)}
                      >
                        {isOpen ? "Show less" : "Show more"}
                      </button>
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
                          Open on Farcaster
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* локальные стили — только для Social signals */}
      <style jsx>{`
        .social-signals-card {
          max-width: 980px;
          margin-left: auto;
          margin-right: auto;
        }

        .social-signals-subtitle {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
          line-height: 1.35;
        }

        /* ВЕБ: строго одна карточка в ряд */
        .social-signals-list {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }

        /* ГОРИЗОНТАЛЬНАЯ КАРТОЧКА */
        .signal-card {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.035);
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);

          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }

        .signal-left {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          min-width: 0;
        }

        .signal-avatar {
          border-radius: 999px;
          object-fit: cover;
          flex: 0 0 auto;
          margin-top: 2px;
        }

        .signal-avatar-fallback {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          flex: 0 0 auto;
          margin-top: 2px;
        }

        .signal-who {
          min-width: 0;
        }

        .signal-name {
          font-weight: 800;
          line-height: 1.1;
        }

        .signal-who-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 2px;
          min-width: 0;
        }

        .signal-username {
          opacity: 0.75;
          white-space: nowrap;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .signal-score {
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
        }

        .signal-time {
          margin-top: 4px;
          font-size: 12px;
          opacity: 0.6;
          white-space: nowrap;
        }

        .signal-right {
          min-width: 0;
        }

        .signal-text {
          white-space: pre-wrap;
          line-height: 1.4;
          overflow-wrap: anywhere;
          word-break: break-word;
          font-size: 14px;
        }

        /* чтобы не было “простыней” на вебе */
        .signal-text.clamp {
          display: -webkit-box;
          -webkit-line-clamp: 9;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .signal-more {
          margin-top: 6px;
          padding: 0;
          border: 0;
          background: transparent;
          color: rgba(255, 255, 255, 0.85);
          font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
        }

        .signal-footer {
          margin-top: 10px;
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
          background: rgba(255, 255, 255, 0.1);
          white-space: nowrap;
        }

        .signal-link {
          font-size: 12px;
          opacity: 0.9;
          text-decoration: underline;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        /* МОБИЛА: только уменьшаем шрифты (и чуть адаптируем расклад) */
        @media (max-width: 560px) {
          .social-signals-subtitle {
            font-size: 11px; /* ↓ только шрифт */
          }

          .signal-card {
            grid-template-columns: 1fr; /* чтобы не ломалось на узком экране */
          }

          .signal-text {
            font-size: 13px; /* ↓ только шрифт (для мобилы) */
            line-height: 1.35;
          }

          .signal-name {
            font-size: 14px; /* ↓ только шрифт */
          }

          .signal-username {
            font-size: 12px; /* ↓ только шрифт */
            max-width: 55vw;
          }

          .signal-time {
            font-size: 11px; /* ↓ только шрифт */
          }
        }
      `}</style>
    </section>
  );
}
