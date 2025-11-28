// app/token/[address]/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type Token = {
  token_address: string;
  name?: string | null;
  symbol?: string | null;
  source?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  first_seen_at?: string | null;
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
  farcaster_url?: string | null;
  website_url?: string | null;
  x_url?: string | null;
  telegram_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
};

async function fetchTokensFromApi(): Promise<Token[]> {
  // БЫЛО: const h = headers();
  const h = await headers();                          // ← добавили await

  const protocol = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  const baseUrl = `${protocol}://${host}`;

  const res = await fetch(`${baseUrl}/api/tokens`, {
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Failed to fetch /api/tokens for token page", res.status);
    return [];
  }

  const json = await res.json();
  return (json.items ?? []) as Token[];
}
export default async function TokenPage({
  params,
}: {
  params: { address: string };
}) {
  // адрес из URL
  const addressParam = decodeURIComponent(params.address).toLowerCase();

  // берём токены именно из API, а не из lib/providers
  const tokens = await fetchTokensFromApi();

  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === addressParam
  );

  if (!token) {
    return (
      <div className="hatchr-root">
        <div className="hatchr-shell">
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "16px",
              background: "#f9fafb",
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Token
            </h1>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Token not found.</p>
            <Link
              href="/"
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                textDecoration: "none",
              }}
            >
              ← Back to Hatchr
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const name = token.name || token.symbol || token.token_address;
  const symbol = token.symbol || "";
  const createdAt = token.first_seen_at
    ? new Date(token.first_seen_at)
    : null;

  return (
    <div className="hatchr-root">
      <div className="hatchr-shell">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Token</h1>
          <Link
            href="/"
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              textDecoration: "none",
            }}
          >
            ← Back to Hatchr
          </Link>
        </div>

        <div
          style={{
            borderRadius: 18,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            padding: "16px 18px 18px",
            display: "grid",
            gridTemplateColumns: "120px minmax(0,1fr)",
            gap: 16,
          }}
        >
          {/* Левая колонка — аватар */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 24,
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              fontSize: 32,
              fontWeight: 600,
            }}
          >
            {token.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
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
              (symbol || name)[0]?.toUpperCase() || "?"
            )}
          </div>

          {/* Правая колонка — информация */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </div>
                {symbol && (
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#6b7280",
                    }}
                  >
                    {symbol}
                  </div>
                )}
              </div>
              {createdAt && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {createdAt.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                  <br />
                  {createdAt.toLocaleDateString("en-GB")}
                </div>
              )}
            </div>

            {/* Цифры */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>MC</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {token.market_cap_usd != null
                    ? `$${token.market_cap_usd.toLocaleString()}`
                    : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Vol 24h</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {token.volume_24h_usd != null
                    ? `$${token.volume_24h_usd.toLocaleString()}`
                    : "—"}
                </div>
              </div>
              {token.liquidity_usd != null && (
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    Liquidity
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    ${token.liquidity_usd.toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Адрес + source */}
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Address</span>
                <br />
                <code
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    background: "#f3f4f6",
                    padding: "2px 6px",
                    borderRadius: 6,
                  }}
                >
                  {token.token_address}
                </code>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Source</span>
                <br />
                {token.source_url ? (
                  <a
                    href={token.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      textDecoration: "none",
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    {token.source || "source"}
                  </a>
                ) : (
                  <span style={{ fontSize: 12 }}>
                    {token.source || "—"}
                  </span>
                )}
              </div>
            </div>

            {/* Соцсети */}
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                Socials
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {token.farcaster_url && (
                  <a
                    href={token.farcaster_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
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
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    X
                  </a>
                )}
                {token.website_url && (
                  <a
                    href={token.website_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    Website
                  </a>
                )}
                {token.telegram_url && (
                  <a
                    href={token.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      textDecoration: "none",
                    }}
                  >
                    Telegram
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
