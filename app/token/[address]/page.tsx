// app/token/[address]/page.tsx

import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function formatCreated(dateString: string | null) {
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

async function fetchToken(address: string): Promise<TokenItem | null> {
  const addr = address.toLowerCase();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/tokens`, {
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Failed to fetch /api/tokens", res.status);
    return null;
  }

  const data: TokensResponse = await res.json();

  const token =
    data.items.find(
      (t) => t.token_address.toLowerCase() === addr
    ) || null;

  return token;
}

export default async function TokenPage({
  params,
}: {
  params: { address: string };
}) {
  const address = params.address;

  if (!address || !address.startsWith("0x") || address.length < 10) {
    return (
      <main className="hatchr-root">
        <div className="hatchr-shell">
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Token
          </h1>
          <p style={{ fontSize: 14, marginBottom: 12 }}>Invalid token address.</p>
          <Link
            href="/"
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              textDecoration: "none",
            }}
          >
            ← Back to Hatchr
          </Link>
        </div>
      </main>
    );
  }

  const token = await fetchToken(address);

  if (!token) {
    return (
      <main className="hatchr-root">
        <div className="hatchr-shell">
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Token
          </h1>
          <p style={{ fontSize: 14, marginBottom: 12 }}>Token not found.</p>
          <Link
            href="/"
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              textDecoration: "none",
            }}
          >
            ← Back to Hatchr
          </Link>
        </div>
      </main>
    );
  }

  const { time, date } = formatCreated(token.first_seen_at);
  const mcap = formatNumber(token.market_cap_usd);
  const vol = formatNumber(token.volume_24h_usd);

  const shortAddress =
    token.token_address.length > 10
      ? `${token.token_address.slice(0, 6)}…${token.token_address.slice(-4)}`
      : token.token_address;

  const name = token.name || token.symbol || "New token";
  const symbol =
    token.symbol && token.symbol !== token.name ? token.symbol : "";

  return (
    <main className="hatchr-root">
      <div className="hatchr-shell">
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
          Token
        </h1>
        <Link
          href="/"
          style={{
            display: "inline-block",
            fontSize: 13,
            marginBottom: 16,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            textDecoration: "none",
          }}
        >
          ← Back to Hatchr
        </Link>

        <div
          style={{
            borderRadius: 18,
            border: "1px solid #e5e7eb",
            padding: 16,
            background: "#ffffff",
            display: "grid",
            gridTemplateColumns: "120px minmax(0, 1fr)",
            gap: 16,
          }}
        >
          {/* левая колонка — аватар */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 24,
              overflow: "hidden",
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 600,
            }}
          >
            {token.image_url ? (
              <img
                src={token.image_url}
                alt={name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              (name || "₿").trim().charAt(0).toUpperCase()
            )}
          </div>

          {/* правая колонка — инфа */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 2,
                  wordBreak: "break-word",
                }}
              >
                {name}
              </div>
              {symbol && (
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#6b7280",
                  }}
                >
                  {symbol}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  marginTop: 4,
                }}
              >
                Time: {time} {date && `· ${date}`}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 24,
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>MC</div>
                <div style={{ fontWeight: 500 }}>{mcap}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Vol 24h</div>
                <div style={{ fontWeight: 500 }}>{vol}</div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0,1fr)",
                rowGap: 4,
                columnGap: 8,
                fontSize: 13,
              }}
            >
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Address</div>
              <div>{shortAddress}</div>

              <div style={{ fontSize: 11, color: "#9ca3af" }}>Source</div>
              <div>{token.source}</div>

              <div style={{ fontSize: 11, color: "#9ca3af" }}>Socials</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {token.farcaster_url && (
                  <a
                    href={token.farcaster_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    Farcaster
                  </a>
                )}
                {token.x_url && (
                  <a
                    href={token.x_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    X
                  </a>
                )}
                {token.telegram_url && (
                  <a
                    href={token.telegram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    Telegram
                  </a>
                )}
                {token.website_url && (
                  <a
                    href={token.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    Website
                  </a>
                )}
              </div>
            </div>

            {token.source_url && (
              <div style={{ marginTop: 8 }}>
                <a
                  href={token.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "7px 18px",
                    borderRadius: 999,
                    background: "#0052ff",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  View on {token.source === "zora" ? "Zora" : "Clanker"}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
