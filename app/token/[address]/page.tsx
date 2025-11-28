// app/token/[address]/page.tsx

import Link from "next/link";
import { getTokens, TokenWithMarket } from "@/lib/providers";

interface TokenPageProps {
  params: {
    address: string;
  };
}

export default async function TokenPage({ params }: TokenPageProps) {
  // аккуратно читаем адрес из URL
    const rawAddress = decodeURIComponent(
    (params.address ?? "").toString()
  )
    .trim()
    .toLowerCase();

  // тянем все токены (как на главной)
  const tokens: TokenWithMarket[] = await getTokens();

  // ищем токен по адресу
  const token = tokens.find(
    (t) =>
      typeof t.token_address === "string" &&
      t.token_address.toLowerCase() === rawAddress
  );

  if (!token) {
    return (
      <div className="hatchr-root">
        <main className="hatchr-shell">
          <h1>Token</h1>
          <p>Token not found.</p>
          <p>
            <Link href="/" className="hatchr-nav-pill">
              ← Back to Hatchr
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const symbol = token.symbol || "";
  const name = token.name || symbol || "New token";

  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Token</h1>
          <Link href="/" className="hatchr-nav-pill">
            ← Back
          </Link>
        </div>

        <div
          style={{
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: 16,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            {/* картинка */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 22,
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 28,
                overflow: "hidden",
                flexShrink: 0,
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
                    borderRadius: 22,
                  }}
                />
              ) : (
                <span>
                  {(symbol || name).trim().charAt(0).toUpperCase() || "₿"}
                </span>
              )}
            </div>

            {/* текстовая часть */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </div>
                  {symbol && symbol !== name && (
                    <div
                      style={{
                        fontSize: 12,
                        textTransform: "uppercase",
                        color: "#6b7280",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {symbol}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    textAlign: "right",
                  }}
                >
                  {token.first_seen_at && (
                    <>
                      <div>
                        {new Date(token.first_seen_at).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          }
                        )}
                      </div>
                      <div>
                        {new Date(token.first_seen_at).toLocaleDateString(
                          "en-US",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Address</div>
                  <div style={{ fontFamily: "monospace" }}>
                    {token.token_address}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Source</div>
                  <div>{token.source === "clanker" ? "Clanker" : "Zora"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>MC</div>
                  <div>{token.market_cap_usd ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    Vol 24h
                  </div>
                  <div>{token.volume_24h_usd ?? "—"}</div>
                </div>
              </div>

              {token.source_url && (
                <a
                  href={token.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-card-button"
                >
                  View on {token.source === "zora" ? "Zora" : "Clanker"}
                </a>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
