// app/token/[address]/page.tsx

import { getTokens } from "@/lib/providers";

type TokenPageProps = {
  params: { address: string };
};

export default async function TokenPage({ params }: TokenPageProps) {
  const rawAddress = params.address;

  if (!rawAddress || typeof rawAddress !== "string") {
    return (
      <main style={{ padding: 24 }}>
        <h1>Token</h1>
        <p>Invalid token address.</p>
      </main>
    );
  }

  const address = rawAddress.toLowerCase();

  // Берём те же токены, что и на главной
  const tokens = await getTokens();
  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Token not found</h1>
        <p>{address}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1>
        {token.name || token.symbol || "Token"}{" "}
        {token.symbol && `(${token.symbol})`}
      </h1>
      <p style={{ marginTop: 8, color: "#6b7280" }}>
        Address: {token.token_address}
      </p>
      <p style={{ marginTop: 4, color: "#6b7280" }}>
        Source: {token.source === "clanker" ? "Clanker" : "Zora"}
      </p>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Market</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>Price: {token.price_usd ?? "—"}</li>
          <li>MC: {token.market_cap_usd ?? "—"}</li>
          <li>Liquidity: {token.liquidity_usd ?? "—"}</li>
          <li>Vol 24h: {token.volume_24h_usd ?? "—"}</li>
        </ul>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Links</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>
            Source:{" "}
            {token.source_url ? (
              <a href={token.source_url} target="_blank" rel="noreferrer">
                Open on {token.source === "clanker" ? "Clanker" : "Zora"}
              </a>
            ) : (
              "—"
            )}
          </li>
          <li>
            Farcaster:{" "}
            {token.farcaster_url ? (
              <a href={token.farcaster_url} target="_blank" rel="noreferrer">
                {token.farcaster_url}
              </a>
            ) : (
              "—"
            )}
          </li>
        </ul>
      </section>
    </main>
  );
}
