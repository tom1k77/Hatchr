"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "./hooks/useIsMobile";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string | null;

  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;

  farcaster_url?: string | null;
  x_url?: string | null;
  telegram_url?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  image_url?: string | null;
  farcaster_fid?: number | null;
};

type TokensResponse = {
  count: number;
  items: TokenItem[];
};

type FarcasterProfile = {
  username: string;
  display_name: string;
  pfp_url: string | null;
  follower_count: number;
  following_count: number;
};

const REFRESH_INTERVAL_MS = 30_000;
const LEFT_PAGE_SIZE = 9;
const RIGHT_PAGE_SIZE = 7;

// ---- форматирование чисел ----
function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "—";
  if (Math.abs(value) < 1) return value.toFixed(6);
  if (Math.abs(value) < 10) return value.toFixed(4);
  if (Math.abs(value) < 1000) return value.toFixed(2);
  if (Math.abs(value) < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatCreated(dateString: string | null): { time: string; date: string } {
  if (!dateString) return { time: "—", date: "" };
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { time: dateString, date: "" };

  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return { time, date };
}

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const created = new Date(dateString).getTime();
  if (Number.isNaN(created)) return "";

  const diffMs = Date.now() - created;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function extractFarcasterUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

function extractXUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[0];
  } catch {
    return null;
  }
}

function extractInstagramUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[0];
  } catch {
    return null;
  }
}

function extractTiktokUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const last = parts[parts.length - 1];
    return last.startsWith("@") ? last.slice(1) : last;
  } catch {
    return null;
  }
}

// fallback-аватар Farcaster: используем /public/farcaster-logo.png
function FarcasterFallbackIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/farcaster-logo.png"
      alt="Farcaster"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        objectFit: "cover",
        backgroundColor: "#1f2933",
      }}
    />
  );
}

type BottomTabKey = "new" | "signals" | "trending" | "api";

function MobileBottomNav({ active }: { active: BottomTabKey }) {
  const itemBase: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "10px 8px",
    borderRadius: 16,
    textDecoration: "none",
    fontSize: 11,
    lineHeight: 1,
    userSelect: "none",
  };

  const activeStyle: React.CSSProperties = {
    background: "#111827",
    color: "#ffffff",
  };

  const inactiveStyle: React.CSSProperties = {
    background: "transparent",
    color: "#6b7280",
  };

  // NOTE: Trending/API пока заглушки — поменяешь href на реальные роуты
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        padding: "10px 12px",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          display: "flex",
          gap: 6,
          padding: 6,
        }}
      >
        <Link href="/" style={{ ...itemBase, ...(active === "new" ? activeStyle : inactiveStyle) }}>
          <span style={{ fontSize: 18 }}>⚡️</span>
          <span>New</span>
        </Link>

        <Link
          href="/social-signals"
          style={{ ...itemBase, ...(active === "signals" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>📣</span>
          <span>Signals</span>
        </Link>

        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ ...itemBase, ...(active === "trending" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>📊</span>
          <span>Trending</span>
        </a>

        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ ...itemBase, ...(active === "api" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>👥</span>
          <span>API</span>
        </a>
      </div>
    </div>
  );
}

/* ====== NEW: Игровая загрузка (typing + shimmer skeletons) ====== */
function LoadingGame({ isMobile }: { isMobile: boolean }) {
  const lines = [
    "Booting Hatchr engine…",
    "Scanning Zora + Clanker mints on Base…",
    "Pulling creator stats & socials…",
    "Warming up charts…",
    "Almost there — tokens incoming 🚀",
  ];

  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const d = setInterval(() => {
      setDots((p) => (p.length >= 3 ? "." : p + "."));
    }, 350);
    return () => clearInterval(d);
  }, []);

  useEffect(() => {
    const full = lines[i] ?? lines[lines.length - 1];
    setTyped("");

    let k = 0;
    const t = setInterval(() => {
      k += 1;
      setTyped(full.slice(0, k));
      if (k >= full.length) {
        clearInterval(t);
        setTimeout(() => setI((prev) => (prev + 1) % lines.length), 700);
      }
    }, 28);

    return () => clearInterval(t);
  }, [i]);

  const SkeletonCard = () => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)",
            backgroundSize: "200% 100%",
            animation: "hatchrShimmer 1.1s linear infinite",
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: 12,
              width: "70%",
              borderRadius: 999,
              background: "linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)",
              backgroundSize: "200% 100%",
              animation: "hatchrShimmer 1.1s linear infinite",
              marginBottom: 10,
            }}
          />
          <div
            style={{
              height: 10,
              width: "45%",
              borderRadius: 999,
              background: "linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)",
              backgroundSize: "200% 100%",
              animation: "hatchrShimmer 1.1s linear infinite",
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                height: 10,
                width: 90,
                borderRadius: 999,
                background: "linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)",
                backgroundSize: "200% 100%",
                animation: "hatchrShimmer 1.1s linear infinite",
              }}
            />
            <div
              style={{
                height: 10,
                width: 120,
                borderRadius: 999,
                background: "linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)",
                backgroundSize: "200% 100%",
                animation: "hatchrShimmer 1.1s linear infinite",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes hatchrShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        style={{
          border: "1px solid #e5e7eb",
          background: "#fff",
          borderRadius: 22,
          padding: isMobile ? 14 : 18,
          marginTop: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🐣</span>
          <div style={{ fontWeight: 700, color: "#111827" }}>Hatchr is loading{dots}</div>
        </div>

        <div
          style={{
            marginTop: 10,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 13,
            color: "#374151",
            minHeight: 22,
          }}
        >
          {typed}
          <span style={{ opacity: 0.6 }}>▍</span>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          {!isMobile && (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          Tip: first load can take ~10–15s (cold start). After that it’s much faster.
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  const isMobile = useIsMobile();
  const pathname = usePathname();

  const activeTab: BottomTabKey = useMemo(() => {
    if (pathname?.startsWith("/social-signals")) return "signals";
    if (pathname?.startsWith("/trending")) return "trending";
    if (pathname?.startsWith("/api")) return "api";
    return "new";
  }, [pathname]);

  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "clanker" | "zora">("all");
  const [minVolume, setMinVolume] = useState<number>(0);
  const [hideEmpty, setHideEmpty] = useState<boolean>(false);
  const [hideZeroMarket, setHideZeroMarket] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Record<string, FarcasterProfile>>({});
  const [profileLoading, setProfileLoading] = useState<Record<string, boolean>>({});

  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState(LEFT_PAGE_SIZE);
  const [visibleFeed, setVisibleFeed] = useState(RIGHT_PAGE_SIZE);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [creatorScores, setCreatorScores] = useState<Record<number, number>>({});
  const [hatchrScores, setHatchrScores] = useState<Record<number, number>>({});

  // ✅ показываем "игровую" загрузку только на первом заходе
  const isInitialLoading = isLoading && tokens.length === 0;

  // ---------- загрузка токенов + кэш цифр ----------
  async function loadTokens() {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (!res.ok) throw new Error(`Tokens API error: ${res.status}`);

      const data: TokensResponse = await res.json();

      setTokens((prev) => {
        const prevMap = new Map(prev.map((t) => [t.token_address.toLowerCase(), t]));

        const merged = data.items.map((t) => {
          const key = t.token_address.toLowerCase();
          const old = prevMap.get(key);

          if (!old) return t;

          const keepNumber = (field: keyof TokenItem): number | null => {
            const newVal = t[field] as unknown as number | null;
            const oldVal = old[field] as unknown as number | null;

            if (newVal == null || !Number.isFinite(newVal) || newVal === 0) {
              return oldVal ?? null;
            }
            return newVal;
          };

          return {
            ...t,
            market_cap_usd: keepNumber("market_cap_usd"),
            liquidity_usd: keepNumber("liquidity_usd"),
            volume_24h_usd: keepNumber("volume_24h_usd"),
            price_usd: keepNumber("price_usd"),
          };
        });

        return merged;
      });
    } catch (e) {
      console.error(e);
      setError("Не удалось загрузить токены. Попробуй обновить страницу позже.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();
    const id = setInterval(loadTokens, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // при смене фильтров — сбрасываем пагинацию
  useEffect(() => {
    setVisibleRows(LEFT_PAGE_SIZE);
    setVisibleFeed(RIGHT_PAGE_SIZE);
  }, [sourceFilter, minVolume, hideEmpty, hideZeroMarket, search]);

  const filteredTokens = useMemo(() => {
    const base = tokens.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;

      if (minVolume > 0) {
        const vol = t.volume_24h_usd ?? 0;
        if (vol < minVolume) return false;
      }

      if (hideZeroMarket) {
        const hasCap = (t.market_cap_usd ?? 0) > 0;
        const hasVol = (t.volume_24h_usd ?? 0) > 0;
        if (!hasCap && !hasVol) return false;
      }

      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const name = (t.name || "").toLowerCase();
        const symbol = (t.symbol || "").toLowerCase();
        const addr = (t.token_address || "").toLowerCase();
        if (!name.includes(s) && !symbol.includes(s) && !addr.includes(s)) {
          return false;
        }
      }

      if (hideEmpty) {
        const hasCap = (t.market_cap_usd ?? 0) > 0;
        const hasVol = (t.volume_24h_usd ?? 0) > 0;
        const hasSocial =
          !!t.farcaster_url ||
          !!t.x_url ||
          !!t.instagram_url ||
          !!t.tiktok_url ||
          !!t.telegram_url ||
          !!t.website_url;

        if (!hasCap && !hasVol && !hasSocial) return false;
      }

      return true;
    });

    const sorted = [...base].sort((a, b) => {
      const ta = new Date(a.first_seen_at || 0).getTime();
      const tb = new Date(b.first_seen_at || 0).getTime();
      return tb - ta;
    });

    return sorted;
  }, [tokens, sourceFilter, minVolume, hideEmpty, hideZeroMarket, search]);

  const visibleTokens = useMemo(() => filteredTokens.slice(0, visibleRows), [filteredTokens, visibleRows]);

  // Загружаем Neynar score для создателей с FID
  useEffect(() => {
    const loadedFids = new Set<number>(Object.keys(creatorScores).map(Number));

    tokens.forEach((t) => {
      const fid = (t as any).farcaster_fid as number | null | undefined;
      if (!fid) return;
      if (loadedFids.has(fid)) return;

      fetch(`/api/token-score?fid=${fid}`)
        .then((r) => r.json())
        .then((json) => {
          if (typeof json.neynar_score === "number" && Number.isFinite(json.neynar_score)) {
            setCreatorScores((prev) => ({ ...prev, [fid]: json.neynar_score }));
          } else if (typeof json.creator_score === "number" && Number.isFinite(json.creator_score)) {
            setCreatorScores((prev) => ({ ...prev, [fid]: json.creator_score }));
          }

          if (typeof json.hatchr_score === "number" && Number.isFinite(json.hatchr_score)) {
            setHatchrScores((prev) => ({ ...prev, [fid]: json.hatchr_score }));
          } else if (typeof json.hatchr_score_v1 === "number" && Number.isFinite(json.hatchr_score_v1)) {
            setHatchrScores((prev) => ({ ...prev, [fid]: json.hatchr_score_v1 }));
          }
        })
        .catch(() => {});
    });
  }, [tokens, creatorScores]);

  // все торгуемые токены для live feed
  const tradedTokensAll = useMemo(() => {
    const nonZero = filteredTokens.filter((t) => (t.market_cap_usd ?? 0) > 0 || (t.volume_24h_usd ?? 0) > 0);

    const sorted = [...nonZero].sort((a, b) => {
      const volA = a.volume_24h_usd ?? 0;
      const volB = b.volume_24h_usd ?? 0;

      if (volB !== volA) return volB - volA;

      const timeA = new Date(a.first_seen_at || "").getTime();
      const timeB = new Date(b.first_seen_at || "").getTime();
      return timeB - timeA;
    });

    return sorted;
  }, [filteredTokens]);

  const tradedTokensVisible = useMemo(() => tradedTokensAll.slice(0, visibleFeed), [tradedTokensAll, visibleFeed]);

  async function ensureProfile(username: string) {
    if (!username) return;
    if (profiles[username] || profileLoading[username]) return;

    setProfileLoading((prev) => ({ ...prev, [username]: true }));
    try {
      const res = await fetch(`/api/farcaster-profile?username=${encodeURIComponent(username)}`);
      if (!res.ok) return;
      const data: FarcasterProfile = await res.json();
      setProfiles((prev) => ({ ...prev, [username]: data }));
    } catch (e) {
      console.error("Profile fetch failed for", username, e);
    } finally {
      setProfileLoading((prev) => ({ ...prev, [username]: false }));
    }
  }

  function handleCopyAddress(address: string) {
    if (!address) return;
    const key = address.toLowerCase();
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1000);
      })
      .catch(() => {});
  }

  function handleLoadMore() {
    setVisibleRows((prev) => prev + LEFT_PAGE_SIZE);
    setVisibleFeed((prev) => prev + RIGHT_PAGE_SIZE);
  }

  return (
    <div className="hatchr-root">
      {/* чтобы контент не прятался под нижней навигацией */}
      <main className="hatchr-shell" style={{ paddingBottom: isMobile ? 110 : undefined }}>
        {/* top bar */}
        <div className="hatchr-topbar">
          <div className="hatchr-brand">
            <div className="hatchr-brand-logo-circle">
              <img
                src="/hatchr-logo.png"
                alt="Hatchr"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const parent = e.currentTarget.parentElement;
                  if (parent && !parent.querySelector(".hatchr-brand-logo-letter")) {
                    const span = document.createElement("span");
                    span.className = "hatchr-brand-logo-letter";
                    span.textContent = "H";
                    parent.appendChild(span);
                  }
                }}
              />
            </div>
            <div className="hatchr-brand-title">
              <span className="hatchr-brand-title-main">Hatchr</span>
              <span className="hatchr-brand-title-sub">Analytics layer for Base. Discover new tokens on Base live.</span>
            </div>
          </div>

          {/* Десктопные табы оставляем сверху, на мобилке скрываем */}
          {!isMobile && (
            <nav className="hatchr-nav">
              <span className="hatchr-nav-pill primary">New tokens</span>
              <Link href="/social-signals" className="hatchr-nav-pill">
                Social signals
              </Link>
              <span className="hatchr-nav-pill">Trending</span>
              <span className="hatchr-nav-pill">API</span>
            </nav>
          )}
        </div>

        <div className="hatchr-main-grid">
          {/* левая колонка */}
          <section>
            {/* фильтры */}
            <section className="hatchr-filters">
              <div className="hatchr-filters-left">
                <label className="hatchr-label">
                  Source:
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as "all" | "clanker" | "zora")}
                    className="hatchr-select"
                  >
                    <option value="all">All</option>
                    <option value="clanker">Clanker</option>
                    <option value="zora">Zora</option>
                  </select>
                </label>

                <label className="hatchr-label">
                  Min Volume (USD):
                  <input
                    type="number"
                    value={minVolume}
                    onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
                    className="hatchr-input-number"
                    style={{ width: 80 }}
                  />
                </label>

                <label className="hatchr-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} style={{ margin: 0 }} />
                  Hide empty
                </label>

                <label
                  className="hatchr-label"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                >
                  <input
                    type="checkbox"
                    checked={hideZeroMarket}
                    onChange={(e) => setHideZeroMarket(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  Hide 0 mcap/vol
                </label>
              </div>

              <div className="hatchr-filters-search">
                <input
                  type="text"
                  placeholder="Search name / symbol / address"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="hatchr-search"
                />
              </div>
            </section>

            {error && <div className="hatchr-error">{error}</div>}

            {/* ====== MOBILE: карточки в один столбец ====== */}
            {isMobile && (
              <div className="token-card-list">
                {isInitialLoading ? (
                  <LoadingGame isMobile={true} />
                ) : visibleTokens.length === 0 ? (
                  <div className="hatchr-table-empty">Nothing here yet. Try again in a minute.</div>
                ) : (
                  visibleTokens.map((token) => {
                    const { time, date } = formatCreated(token.first_seen_at);
                    const symbol = token.symbol || "";
                    const name = token.name || symbol || "New token";
                    const username = extractFarcasterUsername(token.farcaster_url || undefined);
                    const mcap = formatNumber(token.market_cap_usd);
                    const vol = formatNumber(token.volume_24h_usd);

                    const firstLetter = (symbol || name).trim().charAt(0).toUpperCase() || "₿";
                    const sourceLabel = token.source === "clanker" ? "Clanker" : "Zora";

                    const creatorFid = (token as any).farcaster_fid as number | null | undefined;
                    const creatorScore = creatorFid != null ? creatorScores[creatorFid] : undefined;

                    return (
                      <Link
                        key={token.token_address}
                        href={`/token?address=${token.token_address.toLowerCase()}`}
                        className="token-card-link"
                      >
                        <div className="token-card">
                          <div className="token-card-top">
                            <div className="token-card-avatar">
                              {token.image_url ? (
                                <img
                                  src={token.image_url}
                                  alt={name}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: "16px",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <span>{firstLetter}</span>
                              )}
                            </div>

                            <div className="token-card-main">
                              <div className="token-card-header">
                                <div className="token-card-title">
                                  <span className="token-card-name">{name}</span>
                                  {symbol && symbol !== name && <span className="token-card-symbol">&nbsp;{symbol}</span>}
                                </div>
                                <div className="token-card-time">
                                  {time} · {date}
                                </div>
                              </div>

                              <div className="token-card-stats">
                                <span>MC: {mcap}</span>
                                <span>Vol 24h: {vol}</span>
                              </div>

                              {creatorScore != null && <div className="token-card-score">Creator score: {creatorScore}</div>}

                              <div className="token-card-source">
                                <span className="token-card-source-pill">{sourceLabel}</span>
                                {username && (
                                  <>
                                    <span style={{ margin: "0 4px" }}>·</span>
                                    <span className="token-card-creator">@{username}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            )}

            {/* ====== DESKTOP: карточки как на скетче ====== */}
            {!isMobile && (
              <div className="desktop-card-grid">
                {isInitialLoading ? (
                  <LoadingGame isMobile={false} />
                ) : visibleTokens.length === 0 ? (
                  <div className="hatchr-table-empty">Nothing here yet. Try again in a minute.</div>
                ) : (
                  visibleTokens.map((token) => {
                    const rowKey = `${token.source}-${token.token_address}`;
                    const { time, date } = formatCreated(token.first_seen_at);

                    const symbol = token.symbol || "";
                    const name = token.name || symbol || "New token";
                    const sourceLabel = token.source === "clanker" ? "Clanker" : "Zora";

                    const username = extractFarcasterUsername(token.farcaster_url || undefined);
                    const profile = username ? profiles[username] : undefined;

                    const mcap = formatNumber(token.market_cap_usd);
                    const vol = formatNumber(token.volume_24h_usd);

                    const fullAddress = token.token_address || "";
                    const shortAddress =
                      fullAddress.length > 8 ? `0x${fullAddress.slice(2, 6)}…${fullAddress.slice(-4)}` : fullAddress;

                    const copyKey = fullAddress.toLowerCase();
                    const isCopied = copiedKey === copyKey;

                    const xUsername = extractXUsername(token.x_url || undefined);
                    const igUsername = extractInstagramUsername(token.instagram_url || undefined);
                    const ttUsername = extractTiktokUsername(token.tiktok_url || undefined);

                    let secondarySocial: { url: string; label: string } | null = null;

                    if (!username) {
                      if (token.x_url) {
                        secondarySocial = { url: token.x_url, label: xUsername ? `@${xUsername}` : "X" };
                      } else if (token.instagram_url) {
                        secondarySocial = {
                          url: token.instagram_url,
                          label: igUsername ? `@${igUsername}` : "Instagram",
                        };
                      } else if (token.tiktok_url) {
                        secondarySocial = { url: token.tiktok_url, label: ttUsername ? `@${ttUsername}` : "TikTok" };
                      }
                    }

                    const isTooltipVisible = hoveredRowKey === rowKey;

                    const creatorFid = (token as any).farcaster_fid as number | null | undefined;
                    const creatorScore = creatorFid != null ? creatorScores[creatorFid] : undefined;

                    return (
                      <Link
                        key={rowKey}
                        href={`/token?address=${token.token_address.toLowerCase()}`}
                        className="no-underline"
                      >
                        <div className="h-card">
                          <div className="h-card-main">
                            <div className="h-card-left">
                              <div className="h-card-avatar">
                                {token.image_url ? (
                                  <img src={token.image_url} alt={name} />
                                ) : (
                                  <span>{(symbol || name).trim().charAt(0).toUpperCase() || "₿"}</span>
                                )}
                              </div>

                              <div className="h-card-left-meta">
                                <div className="h-card-row">
                                  <span className="h-card-row-label">Time</span>
                                  <span className="h-card-row-value h-card-row-value-time">
                                    {time} · {date}
                                  </span>
                                </div>

                                {creatorFid != null && (
                                  <div className="h-card-row">
                                    <span className="h-card-row-label">Hatchr score</span>
                                    <span className="h-card-row-value">
                                      {typeof hatchrScores[creatorFid] === "number"
                                        ? hatchrScores[creatorFid].toFixed(2)
                                        : "—"}
                                    </span>
                                  </div>
                                )}

                                <div className="h-card-row">
                                  <span className="h-card-row-label">Address</span>
                                  <span className="h-card-row-value h-card-row-value-address">
                                    <span title={fullAddress} style={{ marginRight: 6 }}>
                                      {shortAddress || "—"}
                                    </span>
                                    {fullAddress && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          handleCopyAddress(fullAddress);
                                        }}
                                        className="copy-btn"
                                        title="Copy address"
                                      >
                                        {isCopied ? "✓" : "⧉"}
                                      </button>
                                    )}
                                  </span>
                                </div>

                                <div className="h-card-row">
                                  <span className="h-card-row-label">Source</span>
                                  <span className="h-card-row-value">{sourceLabel}</span>
                                </div>

                                <div className="h-card-row">
                                  <span className="h-card-row-label">Socials</span>
                                  <span className="h-card-row-value">
                                    {username ? (
                                      <div
                                        className="desktop-social-wrap"
                                        onMouseEnter={() => {
                                          setHoveredRowKey(rowKey);
                                          ensureProfile(username);
                                        }}
                                        onMouseLeave={() => setHoveredRowKey(null)}
                                      >
                                        <a
                                          href={`https://warpcast.com/${username}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="desktop-farcaster-pill"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span>@{username}</span>
                                          {profile?.pfp_url ? (
                                            <img
                                              src={profile.pfp_url}
                                              alt={profile.display_name || username}
                                              onError={(e) => {
                                                e.currentTarget.src = "/farcaster-logo.png";
                                              }}
                                            />
                                          ) : (
                                            <FarcasterFallbackIcon size={20} />
                                          )}
                                        </a>

                                        {creatorScore != null && (
                                          <div className="h-card-score-row">
                                            <span className="h-card-stats-label">Creator score</span>
                                            <span className="h-card-stats-value">{creatorScore}</span>
                                          </div>
                                        )}

                                        {isTooltipVisible && profile && (
                                          <div className="desktop-farcaster-tooltip">
                                            <div className="tooltip-header">
                                              {profile.pfp_url ? (
                                                <img
                                                  src={profile.pfp_url}
                                                  alt={profile.display_name || username}
                                                  onError={(e) => {
                                                    e.currentTarget.src = "/farcaster-logo.png";
                                                  }}
                                                />
                                              ) : (
                                                <FarcasterFallbackIcon size={30} />
                                              )}
                                              <div>
                                                <div className="tooltip-name">{profile.display_name || profile.username}</div>
                                                <div className="tooltip-handle">@{profile.username}</div>
                                              </div>
                                            </div>
                                            <div className="tooltip-stats">
                                              <span>
                                                <strong>{profile.follower_count}</strong> followers
                                              </span>
                                              <span>
                                                <strong>{profile.following_count}</strong> following
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : secondarySocial ? (
                                      <a
                                        href={secondarySocial.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="desktop-secondary-pill"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {secondarySocial.label}
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="h-card-right">
                              <div className="h-card-title">
                                <span className="h-card-name">{name}</span>
                                {symbol && symbol !== name && <span className="h-card-symbol">{symbol}</span>}
                              </div>

                              <div className="h-card-stats">
                                <div>
                                  <div className="h-card-stats-label">MC</div>
                                  <div className="h-card-stats-value">{mcap}</div>
                                </div>
                                <div>
                                  <div className="h-card-stats-label">Vol 24h</div>
                                  <div className="h-card-stats-value">{vol}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {token.source_url && (
                            <a
                              href={token.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-card-button"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View on {sourceLabel}
                            </a>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            )}

            {filteredTokens.length > visibleRows && (
              <div style={{ marginTop: 10, textAlign: "center" }}>
                <button
                  type="button"
                  onClick={handleLoadMore}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                    cursor: "pointer",
                  }}
                >
                  Load more
                </button>
              </div>
            )}
          </section>

          <aside className="hatchr-feed">
            <div className="hatchr-feed-title">
              <span>Live traded feed</span>
              <span className="hatchr-feed-badge">non-zero markets</span>
            </div>
            <ul className="hatchr-feed-list">
              {tradedTokensVisible.length === 0 && (
                <li className="hatchr-feed-item">
                  <span className="hatchr-feed-sub">Waiting for the first trades on fresh tokens…</span>
                  <span className="hatchr-feed-sub">Soon: Base-wide stats &amp; creator leaderboards.</span>
                </li>
              )}

              {tradedTokensVisible.map((t) => {
                const username = extractFarcasterUsername(t.farcaster_url || undefined);

                return (
                  <li key={t.token_address + (t.first_seen_at || "")} className="hatchr-feed-item">
                    <div className="hatchr-feed-main">
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="token"
                        style={{ textDecoration: "none", color: "#111827" }}
                      >
                        {t.symbol || t.name || "New token"}
                      </a>
                      <span className="meta">{formatTimeAgo(t.first_seen_at)}</span>
                    </div>
                    <div className="hatchr-feed-sub">
                      🐣 {t.source === "clanker" ? "Clanker" : "Zora"} · {t.name || "Unnamed"}
                    </div>
                    <div className="hatchr-feed-sub">
                      MC: {formatNumber(t.market_cap_usd)} · Vol 24h: {formatNumber(t.volume_24h_usd)}
                    </div>
                    {username && (
                      <div className="hatchr-feed-sub">
                        by{" "}
                        <a
                          href={`https://warpcast.com/${username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#4f46e5", textDecoration: "none" }}
                        >
                          @{username}
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </main>

      {isMobile && <MobileBottomNav active={activeTab} />}
    </div>
  );
}
