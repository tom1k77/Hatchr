// app/token/[address]/page.tsx
import { getTokens, TokenWithMarket } from "@/lib/providers";

type PageProps = {
  params: {
    address: string;
  };
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "—";
  const abs = Math.abs(value);
  if (abs < 1) return value.toFixed(6);
  if (abs < 10) return value.toFixed(4);
  if (abs < 1000) return value.toFixed(2);
  if (abs < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

function formatDateTime(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${time} · ${date}`;
}

export default async function TokenPage({ params }: PageProps) {
  // адрес из URL
  const rawAddress = (params.address || "").trim().toLowerCase();

  // минимальная валидация, чтобы не падать
  if (!rawAddress.startsWith("0x") || rawAddress.length !== 42) {
    return (
      <main className="token-page-root">
        <div className="token-page-shell">
          <h1 className="token-page-title">Token</h1>
          <p>Invalid token address.</p>
        </div>
      </main>
    );
  }

  // забираем все токены так же, как на главной
  const tokens: TokenWithMarket[] = await getTokens();
  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === rawAddress
  );

  if (!token) {
    return (
      <main className="token-page-root">
        <div className="token-page-shell">
          <h1 className="token-page-title">Token</h1>
          <p>Token not found in the current window.</p>
        </div>
      </main>
    );
  }

  const name = token.name || token.symbol || "New token";
  const symbol =
    token.symbol && token.symbol !== name ? token.symbol.toUpperCase() : "";
  const created = formatDateTime(token.first_seen_at);
  const mcap = formatNumber(token.market_cap_usd);
  const vol = formatNumber(token.volume_24h_usd);
  const price = formatNumber(token.price_usd);

  const shortAddress =
    token.token_address.length > 10
      ? `${token.token_address.slice(0, 6)}…${token.token_address.slice(-4)}`
      : token.token_address;

  return (
    <main className="token-page-root">
      <div className="token-page-shell">
        {/* шапка */}
        <div className="token-page-breadcrumb">
          <a href="/" className="token-page-back">
            ← Back to Hatchr
          </a>
        </div>

        <div className="token-page-grid">
          {/* ЛЕВАЯ ПЛИТКА: основная инфа по токену */}
          <section className="token-page-main-card">
            <div className="token-page-main-top">
              <div className="token-page-avatar-wrap">
                {token.image_url ? (
                  <img
                    src={token.image_url}
                    alt={name}
                    className="token-page-avatar"
                  />
                ) : (
                  <div className="token-page-avatar placeholder">
                    {(symbol || name).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="token-page-main-meta">
                <div className="token-page-name-row">
                  <h1 className="token-page-title">{name}</h1>
                  {symbol && (
                    <span className="token-page-symbol">{symbol}</span>
                  )}
                </div>
                <div className="token-page-created">{created}</div>

                <div className="token-page-stats-row">
                  <div className="token-page-stat">
                    <div className="token-page-stat-label">Price</div>
                    <div className="token-page-stat-value">
                      {price === "—" ? "—" : `$${price}`}
                    </div>
                  </div>
                  <div className="token-page-stat">
                    <div className="token-page-stat-label">MC</div>
                    <div className="token-page-stat-value">
                      {mcap === "—" ? "—" : `$${mcap}`}
                    </div>
                  </div>
                  <div className="token-page-stat">
                    <div className="token-page-stat-label">Vol 24h</div>
                    <div className="token-page-stat-value">
                      {vol === "—" ? "—" : `$${vol}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* сетка с деталями, плиточно как у pure st */}
            <div className="token-page-info-grid">
              <div className="token-page-info-tile">
                <div className="token-page-info-label">Address</div>
                <div className="token-page-info-value mono">
                  {shortAddress}
                </div>
                <a
                  href={`https://basescan.org/token/${token.token_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-page-link"
                >
                  View on Basescan
                </a>
              </div>

              <div className="token-page-info-tile">
                <div className="token-page-info-label">Source</div>
                <div className="token-page-info-value">
                  {token.source === "clanker"
                    ? "Clanker"
                    : token.source === "zora"
                    ? "Zora"
                    : token.source || "—"}
                </div>
                {token.source_url && (
                  <a
                    href={token.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-link"
                  >
                    Open on {token.source === "zora" ? "Zora" : "Clanker"}
                  </a>
                )}
              </div>

              <div className="token-page-info-tile">
                <div className="token-page-info-label">Hatchr Score</div>
                <div className="token-page-info-value">soon™</div>
                <p className="token-page-info-note">
                  Score based on creator social+onchain profile.
                </p>
              </div>
            </div>
          </section>

          {/* ПРАВАЯ КОЛОНКА: соцсети + график-заглушка */}
          <aside className="token-page-side">
            <div className="token-page-side-card">
              <h2 className="token-page-side-title">Socials</h2>
              <div className="token-page-social-list">
                {token.farcaster_url && (
                  <a
                    href={token.farcaster_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-social-link"
                  >
                    Farcaster
                  </a>
                )}
                {token.x_url && (
                  <a
                    href={token.x_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-social-link"
                  >
                    Twitter
                  </a>
                )}
                {token.telegram_url && (
                  <a
                    href={token.telegram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-social-link"
                  >
                    Telegram
                  </a>
                )}
                {token.website_url && (
                  <a
                    href={token.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="token-page-social-link"
                  >
                    Website
                  </a>
                )}
                {!token.farcaster_url &&
                  !token.x_url &&
                  !token.telegram_url &&
                  !token.website_url && (
                    <div className="token-page-social-empty">No socials yet.</div>
                  )}
              </div>
            </div>

            <div className="token-page-side-card">
              <h2 className="token-page-side-title">Chart</h2>
              <div className="token-page-chart-placeholder">
                Chart integration coming soon.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
