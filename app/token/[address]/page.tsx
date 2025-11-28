// app/token/[address]/page.tsx

import { getTokens } from "@/lib/providers";

export default async function TokenPage({ params }) {
  const address = decodeURIComponent(params.address || "").toLowerCase();

  const tokens = await getTokens();
  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    return (
      <main className="token-page">
        <h1>Token not found</h1>
        <p>No token with this address exists in the last fetch window.</p>
      </main>
    );
  }

  return (
    <main className="token-page">
      <h1>{token.name || token.symbol}</h1>

      <div className="token-header">
        <img
          src={token.image_url || "/placeholder.png"}
          alt={token.name}
          className="token-avatar"
        />

        <div className="token-info">
          <p><strong>Address:</strong> {token.token_address}</p>
          <p><strong>Source:</strong> {token.source}</p>

          <p><strong>Price:</strong> {token.price_usd ?? "—"}</p>
          <p><strong>Market Cap:</strong> {token.market_cap_usd ?? "—"}</p>
          <p><strong>Volume 24h:</strong> {token.volume_24h_usd ?? "—"}</p>
        </div>
      </div>

      <div className="token-socials">
        <h2>Socials</h2>
        {token.farcaster_url && (
          <p>
            <a href={token.farcaster_url} target="_blank">
              Farcaster
            </a>
          </p>
        )}
        {token.x_url && (
          <p>
            <a href={token.x_url} target="_blank">
              Twitter
            </a>
          </p>
        )}
        {token.telegram_url && (
          <p>
            <a href={token.telegram_url} target="_blank">
              Telegram
            </a>
          </p>
        )}
      </div>

      <div className="token-chart">
        {/* позже добавим график */}
        <p>Chart coming soon...</p>
      </div>
    </main>
  );
}
