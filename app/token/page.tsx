"use client";

import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/** ---------------------------
 * Share helpers
 * --------------------------- */
function buildTokenShareText(params: {
  symbolOrName: string;
  hatchrScore?: number | null;
  creatorScore?: number | null;
  mentionsCount?: number | null;
  uniqueAuthors?: number | null;
}) {
  const raw = (params.symbolOrName || "").trim();
  const cleaned = raw.replace(/^\$/g, "");
  const cashtag = cleaned ? `$${cleaned.toUpperCase()}` : "This token";

  const lines: string[] = [];
  lines.push(`${cashtag} spotted on @hatchr 👀`);
  lines.push("");

  if (typeof params.hatchrScore === "number" && Number.isFinite(params.hatchrScore)) {
    lines.push(`Hatchr score: ${params.hatchrScore.toFixed(2)}`);
  }

  if (typeof params.creatorScore === "number" && Number.isFinite(params.creatorScore)) {
    lines.push(`Creator score: ${params.creatorScore.toFixed(2)}`);
  }

  if (
    typeof params.mentionsCount === "number" &&
    Number.isFinite(params.mentionsCount) &&
    typeof params.uniqueAuthors === "number" &&
    Number.isFinite(params.uniqueAuthors)
  ) {
    lines.push(`Mentions: ${params.mentionsCount} · ${params.uniqueAuthors} authors`);
  }

  lines.push("");
  lines.push("Look what else is new on Base.");

  return lines.join("\n");
}

function buildTokenShareUrl(address: string) {
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://hatchr.xyz";
  return `${origin}/token?address=${encodeURIComponent(address)}`;
}

function buildWarpcastComposeIntent(text: string, embedUrl: string) {
  return (
    `https://warpcast.com/~/compose?` +
    `text=${encodeURIComponent(text)}` +
    `&embeds[]=${encodeURIComponent(embedUrl)}`
  );
}

/** Warpcast cast link — самый стабильный */
function warpcastCastUrlFromHash(hash?: string | null) {
  if (!hash || typeof hash !== "string") return null;
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `https://warpcast.com/~/cast/${h}`;
}

function TokenPageInner() {
  const searchParams = useSearchParams();

  const rawAddress = searchParams.get("address") || "";
  const normalizedAddress = rawAddress.trim().toLowerCase();

  const [token, setToken] = useState<TokenItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "invalid" | "not-found" | "ok" | "error">("idle");

  // Neynar data
  const [creatorNeynarScore, setCreatorNeynarScore] = useState<number | null>(null);
  const [resolvedFid, setResolvedFid] = useState<number | null>(null);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // social slices
  const [followersQuality, setFollowersQuality] = useState<number | null>(null);
  const [followersAnalytics, setFollowersAnalytics] = useState<any>(null);
  const [tokenMentions, setTokenMentions] = useState<any>(null);
  const [creatorContext, setCreatorContext] = useState<any>(null);

  // ✅ NEW: creator tokens deployed (clanker + basescan)
  const [creatorTokensDeployed, setCreatorTokensDeployed] = useState<any>(null);

  const [hatchrScore, setHatchrScore] = useState<number | null>(null);

  const fullAddress = token?.token_address ?? "";
  const shortAddress =
    fullAddress && fullAddress.length > 8 ? `0x${fullAddress.slice(2, 6)}…${fullAddress.slice(-4)}` : fullAddress;

  const baseScanUrl: string | undefined = fullAddress ? `https://basescan.org/token/${fullAddress}` : undefined;

  useEffect(() => {
    if (!normalizedAddress) {
      setStatus("invalid");
      return;
    }
    const isHex = /^0x[0-9a-fA-F]{40}$/.test(normalizedAddress);
    if (!isHex) {
      setStatus("invalid");
      return;
    }
    setStatus("idle");
  }, [normalizedAddress]);

  // 1) Load token
  useEffect(() => {
    if (!normalizedAddress) return;
    if (status === "invalid") return;

    let cancelled = false;

    async function loadToken() {
      try {
        setIsLoading(true);

        const res = await fetch("/api/tokens", { cache: "no-store" });
        if (!res.ok) {
          console.error("Tokens API error:", res.status);
          if (!cancelled) setStatus("error");
          return;
        }

        const tokensData: TokensResponse = await res.json();
        const foundToken = tokensData.items.find((t) => t.token_address.toLowerCase() === normalizedAddress) || null;

        if (cancelled) return;

        if (!foundToken) {
          setToken(null);
          setStatus("not-found");
        } else {
          setToken(foundToken);
          setStatus("ok");
        }
      } catch (e) {
        console.error("Token page load error:", e);
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadToken();
    return () => {
      cancelled = true;
    };
  }, [normalizedAddress, status]);

  const { time, date } = useMemo(() => formatCreated(token?.first_seen_at ?? null), [token?.first_seen_at]);

  const mcap = formatNumber(token?.market_cap_usd);
  const vol = formatNumber(token?.volume_24h_usd);
  const price = formatNumber(token?.price_usd);
  const liq = formatNumber(token?.liquidity_usd);

  const farcasterHandle = extractFarcasterUsername(token?.farcaster_url);
  const creatorFidFromToken = token?.farcaster_fid ?? null;

  // 2) Load score/analytics
  useEffect(() => {
    if (!token) return;
    if (!creatorFidFromToken && !farcasterHandle) return;

    let cancelled = false;

    async function loadScore() {
      try {
        setScoreLoading(true);

        // reset
        setCreatorNeynarScore(null);
        setResolvedFid(null);
        setResolvedUsername(null);
        setFollowerCount(null);
        setFollowersQuality(null);
        setFollowersAnalytics(null);
        setTokenMentions(null);
        setCreatorContext(null);
        setCreatorTokensDeployed(null);
        setHatchrScore(null);

        const qs = creatorFidFromToken
          ? `fid=${encodeURIComponent(String(creatorFidFromToken))}`
          : `username=${encodeURIComponent(String(farcasterHandle))}`;

        const addressQs = normalizedAddress ? `&address=${encodeURIComponent(normalizedAddress)}` : "";
        const tokenCreatedAtQs = token?.first_seen_at ? `&tokenCreatedAt=${encodeURIComponent(token.first_seen_at)}` : "";
        const tokenNameQs = token?.name ? `&tokenName=${encodeURIComponent(token.name)}` : "";
        const tokenSymbolQs = token?.symbol ? `&tokenSymbol=${encodeURIComponent(token.symbol)}` : "";

        const res = await fetch(`/api/token-score?${qs}${addressQs}${tokenCreatedAtQs}${tokenNameQs}${tokenSymbolQs}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const json = await res.json();
        if (cancelled) return;

        // scores
        if (typeof json?.neynar_score === "number" && Number.isFinite(json.neynar_score)) {
          setCreatorNeynarScore(json.neynar_score);
        } else if (typeof json?.creator_score === "number" && Number.isFinite(json.creator_score)) {
          setCreatorNeynarScore(json.creator_score);
        }

        if (typeof json?.followers_quality === "number" && Number.isFinite(json.followers_quality)) {
          setFollowersQuality(json.followers_quality);
        } else {
          setFollowersQuality(null);
        }

        // hatchr score (new or fallback)
        if (typeof json?.hatchr_score === "number" && Number.isFinite(json.hatchr_score)) {
          setHatchrScore(json.hatchr_score);
        } else if (typeof json?.hatchr_score_v1 === "number" && Number.isFinite(json.hatchr_score_v1)) {
          setHatchrScore(json.hatchr_score_v1);
        }

        // identity
        if (typeof json?.fid === "number" && Number.isFinite(json.fid)) {
          setResolvedFid(json.fid);
        }
        if (typeof json?.username === "string" && json.username.length) {
          setResolvedUsername(json.username);
        }

        // counts
        if (typeof json?.follower_count === "number" && Number.isFinite(json.follower_count)) {
          setFollowerCount(json.follower_count);
        }

        // slices
        setFollowersAnalytics(json?.followers_analytics ?? null);
        setTokenMentions(json?.token_mentions ?? null);
        setCreatorContext(json?.creator_context ?? null);

        // ✅ NEW: clanker + basescan payload
        setCreatorTokensDeployed(json?.creator_tokens_deployed ?? null);
      } catch (e) {
        console.error("token-score on token page failed", e);
      } finally {
        if (!cancelled) setScoreLoading(false);
      }
    }

    loadScore();
    return () => {
      cancelled = true;
    };
  }, [token, creatorFidFromToken, farcasterHandle, normalizedAddress]);

  const hatchr_score = hatchrScore != null ? round2(hatchrScore) : null;

  const identityFid = creatorFidFromToken ?? resolvedFid ?? null;
  const identityHandle = farcasterHandle ? `@${farcasterHandle}` : resolvedUsername ? `@${resolvedUsername}` : "—";

  const followers_quality_value =
    followersQuality != null && Number.isFinite(followersQuality) ? round2(followersQuality) : null;

  const clankerTotal = typeof creatorTokensDeployed?.clanker_total === "number" ? creatorTokensDeployed.clanker_total : null;

  const clankerRecent: any[] = Array.isArray(creatorTokensDeployed?.clanker_recent_tokens)
    ? creatorTokensDeployed.clanker_recent_tokens
    : [];

  const clankerTrust = creatorTokensDeployed?.clanker_trust_counts ?? null;

  const basescan = creatorTokensDeployed?.basescan_wallet_contract_creations ?? null;
  const basescanCount = typeof basescan?.count === "number" ? basescan.count : null;
  const basescanMethod = typeof basescan?.method === "string" ? basescan.method : null;

  /** ---------------------------
   * Share action
   * --------------------------- */
  const onShare = useCallback(async () => {
    if (!token?.token_address) return;

    const tokenLabel = token.symbol || token.name || "Token";

    const text = buildTokenShareText({
      symbolOrName: tokenLabel,
      hatchrScore: hatchr_score,
      creatorScore: creatorNeynarScore,
      mentionsCount: typeof tokenMentions?.mentions_count === "number" ? tokenMentions.mentions_count : null,
      uniqueAuthors: typeof tokenMentions?.unique_authors === "number" ? tokenMentions.unique_authors : null,
    });

    const embedUrl = buildTokenShareUrl(token.token_address);
    const intent = buildWarpcastComposeIntent(text, embedUrl);

    // 1) Mini app composer
    try {
      const mod = await import("@farcaster/miniapp-sdk");
      const sdk = mod.sdk;
      await sdk.actions.composeCast({ text, embeds: [embedUrl] });
      return;
    } catch {}

    // 2) Web fallback
    const w = window.open("about:blank", "_blank");
    if (!w) {
      window.location.href = intent;
      return;
    }
    w.location.href = intent;
  }, [token, hatchr_score, creatorNeynarScore, tokenMentions]);

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        <div className="token-page-header">
          <Link href="/" className="token-page-back">
            ← Back to Hatchr
          </Link>
          <h1 className="token-page-title">Token</h1>
        </div>

        {!normalizedAddress || status === "invalid" ? (
          <div className="token-page-card">
            <p>Invalid token address.</p>
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              URL should look like: <code>/token?address=0x...</code>
            </p>
          </div>
        ) : isLoading && status === "idle" ? (
          <div className="token-page-card">
            <p>Loading token data…</p>
          </div>
        ) : status === "error" ? (
          <div className="token-page-card">
            <p>Failed to load token data. Try again in a minute.</p>
          </div>
        ) : status === "not-found" || !token ? (
          <div className="token-page-card">
            <p>Token not found.</p>
          </div>
        ) : (
          <>
            <div className="token-page-layout">
              <section className="token-page-card token-page-main">
                <div className="token-page-main-header">
                  <div className="token-page-avatar">
                    {token.image_url ? (
                      <img src={token.image_url} alt={token.name || token.symbol || "Token"} />
                    ) : (
                      <span>{(token.symbol || token.name || "T").trim().charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="token-page-title-block">
                    <div className="token-page-name-row">
                      <span className="token-page-name">{token.name || token.symbol || "New token"}</span>
                      {token.symbol && token.symbol !== token.name && <span className="token-page-symbol">{token.symbol}</span>}
                      <span className="token-page-source-pill">{token.source === "clanker" ? "Clanker" : "Zora"}</span>
                    </div>

                    <div className="token-page-meta-row">
                      {time !== "—" && (
                        <span>
                          Created: <strong>{time}</strong> · {date}
                        </span>
                      )}
                    </div>

                    <div className="token-page-address-row">
                      <span className="token-page-label">Address</span>
                      <div className="token-page-address-wrap">
                        <a
                          href={baseScanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="token-page-address-link"
                          title={fullAddress}
                        >
                          {shortAddress}
                        </a>

                        {fullAddress && (
                          <button
                            type="button"
                            className="token-page-copy-btn"
                            onClick={() => navigator.clipboard?.writeText(fullAddress)}
                            title="Copy address"
                          >
                            ⧉
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="token-page-stats-grid">
                  <div className="token-page-stat-tile">
                    <div className="token-page-stat-label">Price</div>
                    <div className="token-page-stat-value">${price}</div>
                  </div>
                  <div className="token-page-stat-tile">
                    <div className="token-page-stat-label">Market cap</div>
                    <div className="token-page-stat-value">${mcap}</div>
                  </div>
                  <div className="token-page-stat-tile">
                    <div className="token-page-stat-label">Liquidity</div>
                    <div className="token-page-stat-value">${liq}</div>
                  </div>
                  <div className="token-page-stat-tile">
                    <div className="token-page-stat-label">Vol 24h</div>
                    <div className="token-page-stat-value">${vol}</div>
                  </div>
                </div>

                <div
                  className="token-page-actions"
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    position: "relative",
                    zIndex: 50,
                    pointerEvents: "auto",
                  }}
                >
                  {token.source_url && (
                    <a
                      href={token.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="token-page-primary-btn"
                      style={{ pointerEvents: "auto" }}
                    >
                      View on {token.source === "clanker" ? "Clanker" : "Zora"}
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={onShare}
                    className="token-page-primary-btn"
                    style={{
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      pointerEvents: "auto",
                      position: "relative",
                      zIndex: 51,
                    }}
                    title="Share this token on Farcaster"
                  >
                    Share on Farcaster
                  </button>
                </div>
              </section>

              <aside className="token-page-card token-page-side">
                <h2 className="token-page-side-title">Socials</h2>
                <ul className="token-page-social-list">
                  <li>
                    <span className="token-page-label">Farcaster</span>
                    {farcasterHandle ? (
                      <a href={`https://warpcast.com/${farcasterHandle}`} target="_blank" rel="noopener noreferrer">
                        @{farcasterHandle}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                  <li>
                    <span className="token-page-label">Website</span>
                    {token.website_url ? (
                      <a href={token.website_url} target="_blank" rel="noopener noreferrer">
                        {token.website_url}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                  <li>
                    <span className="token-page-label">X</span>
                    {token.x_url ? (
                      <a href={token.x_url} target="_blank" rel="noopener noreferrer">
                        {token.x_url}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                  <li>
                    <span className="token-page-label">Telegram</span>
                    {token.telegram_url ? (
                      <a href={token.telegram_url} target="_blank" rel="noopener noreferrer">
                        {token.telegram_url}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                  <li>
                    <span className="token-page-label">Instagram</span>
                    {token.instagram_url ? (
                      <a href={token.instagram_url} target="_blank" rel="noopener noreferrer">
                        {token.instagram_url}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                  <li>
                    <span className="token-page-label">TikTok</span>
                    {token.tiktok_url ? (
                      <a href={token.tiktok_url} target="_blank" rel="noopener noreferrer">
                        {token.tiktok_url}
                      </a>
                    ) : (
                      <span className="token-page-muted">—</span>
                    )}
                  </li>
                </ul>
              </aside>
            </div>

            {/* Score block */}
            <section className="token-page-card" style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
                  gap: 14,
                  alignItems: "start",
                }}
              >
                {/* LEFT: stats */}
                <div style={{ minWidth: 0 }}>
                  <div className="token-page-label">Hatchr score (v1)</div>
                  <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6 }}>
                    {scoreLoading ? "…" : hatchr_score != null ? hatchr_score : "—"}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.82, marginTop: 6 }}>
                    <strong>Followers quality:</strong>{" "}
                    {scoreLoading ? "…" : followers_quality_value != null ? followers_quality_value : "—"}
                    {typeof followersAnalytics?.sample_size === "number" ? (
                      <span style={{ opacity: 0.65 }}> · sample {followersAnalytics.sample_size}</span>
                    ) : null}
                  </div>

                  {/* ✅ tokens deployed (primary = Clanker total) */}
                  <div style={{ fontSize: 12, opacity: 0.82, marginTop: 6 }}>
                    <strong>Tokens deployed (Clanker):</strong>{" "}
                    {scoreLoading ? "…" : clankerTotal != null ? clankerTotal : "—"}
                    {typeof creatorTokensDeployed?.clanker_q === "string" ? (
                      <span style={{ marginLeft: 6, opacity: 0.6 }}>q={creatorTokensDeployed.clanker_q}</span>
                    ) : null}
                  </div>

                  {/* Optional: basescan debug */}
                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                    <strong>Wallet deploys (BaseScan):</strong>{" "}
                    {scoreLoading ? "…" : basescanCount != null ? basescanCount : "—"}
                    {basescanMethod ? <span style={{ marginLeft: 6, opacity: 0.6 }}>({basescanMethod})</span> : null}
                  </div>

                  {/* Trust breakdown */}
                  {clankerTrust ? (
                    <div style={{ fontSize: 12, opacity: 0.82, marginTop: 8 }}>
                      <strong>Trust:</strong> allowlisted {clankerTrust.allowlisted ?? 0} · trusted deployer{" "}
                      {clankerTrust.trusted_deployer ?? 0} · fid verified {clankerTrust.fid_verified ?? 0} · unverified{" "}
                      {clankerTrust.unverified ?? 0}
                    </div>
                  ) : null}

                  {/* optional: debug line */}
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
                    creator_score: {creatorNeynarScore != null ? round2(creatorNeynarScore) : "—"} · followers:{" "}
                    {followerCount != null ? followerCount.toLocaleString() : "—"}
                  </div>

                  {/* Creator context */}
                  <div style={{ fontSize: 12, opacity: 0.86, marginTop: 12 }}>
                    <strong>Creator context:</strong>{" "}
                    {creatorContext?.classification === "ongoing_build_or_preannounced"
                      ? "Ongoing / pre-announced (creator mentioned it before launch)"
                      : creatorContext?.classification === "fresh_launch_or_unknown"
                      ? "Fresh launch / unknown"
                      : creatorContext?.classification === "mentioned_but_no_timestamp_context"
                      ? "Mentioned by creator (no pre-launch timestamp match)"
                      : creatorContext?.classification === "unknown"
                      ? "Unknown"
                      : "—"}
                  </div>

                  {creatorContext && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                      checked: {creatorContext.checked ?? "—"} · matches: {creatorContext.matches ?? "—"}
                      {creatorContext.earliest_match_ts ? (
                        <> · earliest pre-launch: {new Date(creatorContext.earliest_match_ts).toLocaleString("ru-RU")}</>
                      ) : null}
                    </div>
                  )}

                  <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>
                    <div className="token-page-label">Source identity</div>
                    <div style={{ marginTop: 6 }}>
                      FID: <strong>{identityFid ?? "—"}</strong>
                      <br />
                      Handle: <strong>{identityHandle}</strong>
                    </div>
                  </div>
                </div>

                {/* RIGHT: recent + mentions (scroll inside) */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 10,
                      background: "#fff",
                      maxHeight: 460,
                      overflowY: "auto",
                    }}
                  >
                    {/* Recent launches */}
                    <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                      <strong>Recent launches</strong>
                    </div>

                    {Array.isArray(clankerRecent) && clankerRecent.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {clankerRecent.slice(0, 10).map((t: any, idx: number) => (
                          <div
                            key={t?.contract_address ?? idx}
                            style={{
                              border: "1px solid #eef2f7",
                              borderRadius: 10,
                              padding: "8px 10px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>
                                  {(t?.symbol || t?.name || "Token").toString()}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3, lineHeight: 1.2 }}>
                                  {t?.trust_level || "unknown"}
                                  {t?.deployed_at ? (
                                    <>
                                      {" "}
                                      · {new Date(t.deployed_at).toLocaleDateString("ru-RU")}{" "}
                                      {new Date(t.deployed_at).toLocaleTimeString("ru-RU", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                      })}
                                    </>
                                  ) : null}
                                </div>
                                {t?.contract_address ? (
                                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>
                                    {t.contract_address.slice(0, 8)}…{t.contract_address.slice(-4)}
                                  </div>
                                ) : null}
                              </div>

                              {t?.clanker_url ? (
                                <a
                                  href={t.clanker_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 12, whiteSpace: "nowrap" }}
                                >
                                  open
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>—</div>
                    )}

                    {/* Mentions */}
                    <div style={{ marginTop: 14, fontSize: 12, opacity: 0.9 }}>
                      <strong>Mentions</strong>{" "}
                      {tokenMentions ? (
                        <span style={{ opacity: 0.7 }}>
                          · {tokenMentions.mentions_count ?? 0} total · {tokenMentions.unique_authors ?? 0} authors
                        </span>
                      ) : null}
                    </div>

                    {Array.isArray(tokenMentions?.casts) && tokenMentions.casts.length > 0 ? (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                        {tokenMentions.casts.slice(0, 6).map((c: any) => {
                          const openUrl =
                            c?.warpcastUrl ||
                            c?.farcasterUrl ||
                            warpcastCastUrlFromHash(typeof c?.hash === "string" ? c.hash : null);

                          return (
                            <div
                              key={c?.hash ?? `${c?.author?.fid ?? "x"}-${c?.timestamp ?? Math.random()}`}
                              style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: "8px 10px" }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                <div style={{ fontSize: 12, opacity: 0.92 }}>
                                  <strong>@{c?.author?.username ?? "unknown"}</strong>
                                  {c?.timestamp ? (
                                    <span style={{ marginLeft: 8, opacity: 0.6 }}>
                                      {new Date(c.timestamp).toLocaleDateString("ru-RU")}{" "}
                                      {new Date(c.timestamp).toLocaleTimeString("ru-RU", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                      })}
                                    </span>
                                  ) : null}
                                </div>

                                {openUrl ? (
                                  <a
                                    href={openUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                                  >
                                    open
                                  </a>
                                ) : null}
                              </div>

                              <div
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  opacity: 0.82,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  lineHeight: 1.25,
                                  wordBreak: "break-word",
                                }}
                              >
                                {(c?.text ?? "").toString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>—</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>{/* anchor */}</div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function TokenPage() {
  return (
    <Suspense
      fallback={
        <div className="hatchr-root">
          <main className="hatchr-shell">
            <div className="token-page-header">
              <Link href="/" className="token-page-back">
                ← Back to Hatchr
              </Link>
              <h1 className="token-page-title">Token</h1>
            </div>
            <div className="token-page-card">
              <p>Loading token…</p>
            </div>
          </main>
        </div>
      }
    >
      <TokenPageInner />
    </Suspense>
  );
}
