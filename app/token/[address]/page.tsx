import Link from "next/link";
import { getTokens, TokenWithMarket } from "@/lib/providers";

export const dynamic = "force-dynamic";

async function fetchToken(address: string): Promise<TokenWithMarket | null> {
  if (!address) return null;

  const normalized = address.toLowerCase();

  try {
    // Берём те же данные, что и главная страница, напрямую
    const tokens = await getTokens();

    const token = tokens.find(
      (t) =>
        typeof t.token_address === "string" &&
        t.token_address.toLowerCase() === normalized
    );

    return token ?? null;
  } catch (e) {
    console.error("[Token page] getTokens error:", e);
    return null;
  }
}

export default async function TokenPage({
  params,
}: {
  params: { address: string };
}) {
  const token = await fetchToken(params.address);

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

  // Пока что просто показываем сырые данные — дальше уже сделаем красивую плитку
  return (
    <main className="hatchr-root">
      <div className="hatchr-shell">
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
          {token.name || token.symbol || "Token"}
        </h1>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          Address: {token.token_address}
        </p>

        <pre
          style={{
            fontSize: 12,
            padding: 12,
            borderRadius: 8,
            background: "#f3f4f6",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(token, null, 2)}
        </pre>

        <div style={{ marginTop: 16 }}>
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
      </div>
    </main>
  );
}
