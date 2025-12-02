import Link from "next/link";
import { getTokens, type TokenWithMarket } from "@/lib/providers";

type TokenPageProps = {
  searchParams?: { address?: string | string[] };
};

// Нормализуем адрес из query-параметра
function normalizeAddress(raw: string | string[] | undefined): string | null {
  if (!raw) return null;

  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;

  const trimmed = s.trim().toLowerCase();
  if (!trimmed.startsWith("0x")) return null;
  if (trimmed.length !== 42) return null;

  return trimmed;
}

export default async function TokenPage({ searchParams }: TokenPageProps) {
  const rawAddress = searchParams?.address;
  const address = normalizeAddress(rawAddress);

  if (!address) {
    return (
      <div className="hatchr-root">
        <div className="hatchr-shell">
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Token</h1>
          <p style={{ marginBottom: 12 }}>Invalid token address.</p>
          <div
            style={{
              fontSize: 12,
              background: "#f3f4f6",
              borderRadius: 8,
              padding: 8,
              marginBottom: 16,
            }}
          >
            <div>debug:</div>
            <div>rawAddress =&nbsp;{Array.isArray(rawAddress) ? rawAddress[0] : rawAddress ?? ""}</div>
          </div>
          <Link href="/" style={{ fontSize: 14 }}>
            ← Back to Hatchr
          </Link>
        </div>
      </div>
    );
  }

  // Берём токены напрямую с сервера
  let tokens: TokenWithMarket[] = [];
  try {
    tokens = await getTokens();
  } catch (e) {
    console.error("[TokenPage] getTokens error", e);
  }

  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    return (
      <div className="hatchr-root">
        <div className="hatchr-shell">
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Token</h1>
          <p style={{ marginBottom: 12 }}>Token not found.</p>
          <div
            style={{
              fontSize: 12,
              background: "#f3f4f6",
              borderRadius: 8,
              padding: 8,
              marginBottom: 16,
            }}
          >
            <div>debug:</div>
            <div>rawAddress =&nbsp;{Array.isArray(rawAddress) ? rawAddress[0] : rawAddress ?? ""}</div>
            <div>address =&nbsp;{address}</div>
            <div>tokens loaded =&nbsp;{tokens.length}</div>
          </div>
          <Link href="/" style={{ fontSize: 14 }}>
            ← Back to Hatchr
          </Link>
        </div>
      </div>
    );
  }

  const shortAddress = `${token.token_address.slice(0, 6)}…${token.token_address.slice(-4)}`;

  return (
    <div className="hatchr-root">
      <div className="hatchr-shell">
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
          {token.name || "Token"} ({token.symbol || "—"})
        </h1>

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          {/* Картинка */}
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
                alt={token.name || token.symbol || "token"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              (token.symbol || token.name || "?")
                .toString()
                .trim()
                .charAt(0)
                .toUpperCase()
            )}
          </div>

          {/* Инфо по токену */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Address:&nbsp;
              <span style={{ fontFamily: "monospace" }}>{shortAddress}</span>
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Source:&nbsp;
              <span style={{ fontWeight: 500 }}>{token.source || "—"}</span>
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              MC:&nbsp;
              <span style={{ fontWeight: 500 }}>
                {token.market_cap_usd ? `$${token.market_cap_usd.toLocaleString()}` : "—"}
              </span>
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Vol 24h:&nbsp;
              <span style={{ fontWeight: 500 }}>
                {token.volume_24h_usd ? `$${token.volume_24h_usd.toLocaleString()}` : "—"}
              </span>
            </div>
          </div>
        </div>

        <Link href="/" style={{ fontSize: 14 }}>
          ← Back to Hatchr
        </Link>
      </div>
    </div>
  );
}
