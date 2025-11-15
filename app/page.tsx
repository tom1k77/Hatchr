// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AggregatedToken } from "@/lib/providers";

type SourceFilter = "all" | "clanker";

type FarcasterProfile = {
  username: string;
  displayName: string | null;
  pfpUrl: string | null;
  followers: number;
  following: number;
  bio: string;
  fid: number | null;
};

type HoverState = {
  username: string;
  tokenAddress: string;
} | null;

function getFarcasterUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let path = u.pathname || "";
    path = path.replace(/^\/@?/, "");
    const [username] = path.split("/");
    return username || null;
  } catch {
    return null;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [tokens, setTokens] = useState<AggregatedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [minMc, setMinMc] = useState<number>(0);
  const [search, setSearch] = useState("");

  const [profiles, setProfiles] = useState<Record<string, FarcasterProfile>>(
    {}
  );
  const [hovered, setHovered] = useState<HoverState>(null);

  // автообновление каждые 30 сек
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const res = await fetch("/api/tokens", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setTokens(data.items ?? []);
          setLoading(false);
        }
      } catch (e: any) {
        console.error("Failed to load tokens", e);
        if (!cancelled) {
          setError("Ошибка загрузки данных");
          setLoading(false);
        }
      }
    };

    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // фильтрация
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) {
        return false;
      }

      if (minMc > 0) {
        if (!t.marketCapUsd || t.marketCapUsd < minMc) return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const address = t.token_address.toLowerCase();
        const name = (t.name || "").toLowerCase();
        const symbol = (t.symbol || "").toLowerCase();
        if (
          !address.includes(q) &&
          !name.includes(q) &&
          !symbol.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [tokens, sourceFilter, minMc, search]);

  const handleHoverStart = (token: AggregatedToken) => {
    const username = getFarcasterUsername(token.farcaster_url);
    if (!username) return;

    setHovered({ username, tokenAddress: token.token_address });

    if (profiles[username]) return;

    // загружаем профиль Neynar
    fetch(`/api/farcaster-profile?username=${encodeURIComponent(username)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.username) return;
        setProfiles((prev) => ({
          ...prev,
          [data.username]: data,
        }));
      })
      .catch((e) => {
        console.error("Farcaster profile error", e);
      });
  };

  const handleHoverEnd = () => {
    setHovered(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold">
            New Base Tokens (Zora + Clanker)
          </h1>
          <p className="text-sm text-slate-600">
            Auto-refresh every 30 seconds. Market Cap from DexScreener.
          </p>
        </header>

        {/* Фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Source:</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as SourceFilter)
              }
            >
              <option value="all">All</option>
              <option value="clanker">Clanker</option>
              {/* Zora можно добавить позже */}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Min Market Cap (USD):
            </span>
            <input
              type="number"
              min={0}
              className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              value={minMc}
              onChange={(e) =>
                setMinMc(Number(e.target.value) || 0)
              }
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="Search name / symbol / address"
              className="w-64 rounded border border-slate-300 bg-white px-3 py-1 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Name
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Address
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Source
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  Market Cap (USD)
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  Vol 24h
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">
                  Socials
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  Seen
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Загрузка…
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-red-500"
                  >
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && filteredTokens.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Пока пусто. Обнови страницу позже.
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                filteredTokens.map((t) => {
                  const username = getFarcasterUsername(
                    t.farcaster_url
                  );
                  const profile = username
                    ? profiles[username]
                    : undefined;
                  const isHovered =
                    hovered &&
                    username &&
                    hovered.username === username &&
                    hovered.tokenAddress === t.token_address;

                  return (
                    <tr
                      key={`${t.source}-${t.token_address}-${t.first_seen_at}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-2">
                        <a
                          href={t.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {t.name}
                        </a>
                        <div className="text-xs uppercase text-slate-500">
                          {t.symbol}
                        </div>
                      </td>

                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        {t.token_address.slice(0, 6)}…
                        {t.token_address.slice(-4)}
                      </td>

                      <td className="px-4 py-2 text-xs lowercase text-slate-600">
                        {t.source}
                      </td>

                      {/* Market Cap */}
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {t.marketCapUsd
                          ? `$${t.marketCapUsd.toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits: 0,
                              }
                            )}`
                          : "—"}
                      </td>

                      {/* Vol 24h */}
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {t.volume24hUsd
                          ? `$${t.volume24hUsd.toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits: 0,
                              }
                            )}`
                          : "—"}
                      </td>

                      {/* Socials */}
                      <td className="relative px-4 py-2">
                        {username ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full bg-[#5A3DF4] px-3 py-1 text-xs font-medium text-white hover:bg-[#4b32cc]"
                            onMouseEnter={() =>
                              handleHoverStart(t)
                            }
                            onMouseLeave={handleHoverEnd}
                            onClick={() => {
                              window.open(
                                t.farcaster_url!,
                                "_blank"
                              );
                            }}
                          >
                            {profile?.pfpUrl ? (
                              <img
                                src={profile.pfpUrl}
                                alt={username}
                                className="h-5 w-5 rounded-full border border-slate-900/20 bg-slate-900/20 object-cover"
                              />
                            ) : (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">
                                F
                              </span>
                            )}
                            <span>@{username}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            —
                          </span>
                        )}

                        {isHovered && profile && (
                          <div className="absolute z-20 mt-1 w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50 shadow-lg">
                            <div className="mb-2 flex items-center gap-2">
                              {profile.pfpUrl && (
                                <img
                                  src={profile.pfpUrl}
                                  alt={profile.username}
                                  className="h-8 w-8 rounded-full border border-slate-700 object-cover"
                                />
                              )}
                              <div>
                                <div className="font-semibold">
                                  {profile.displayName ??
                                    profile.username}
                                </div>
                                <div className="text-[11px] text-slate-300">
                                  @{profile.username}
                                </div>
                              </div>
                            </div>
                            <div className="mb-1 flex gap-3 text-[11px] text-slate-200">
                              <span>
                                <span className="font-semibold">
                                  {profile.followers.toLocaleString()}
                                </span>{" "}
                                followers
                              </span>
                              <span>
                                <span className="font-semibold">
                                  {profile.following.toLocaleString()}
                                </span>{" "}
                                following
                              </span>
                            </div>
                            {profile.bio && (
                              <div className="mt-1 text-[11px] text-slate-300">
                                {profile.bio}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Seen */}
                      <td className="px-4 py-2 text-right text-xs text-slate-500">
                        {formatDateTime(t.first_seen_at)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
