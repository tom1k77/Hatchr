// app/token/[address]/page.tsx

import Link from "next/link";
import { getTokens, type TokenWithMarket } from "@/lib/providers";

export const dynamic = "force-dynamic"; // без статической генерации и кеша

interface TokenPageProps {
  params: { address: string };
}

export default async function TokenPage({ params }: TokenPageProps) {
  const address = params.address?.toLowerCase();

  // базовая проверка адреса
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return (
      <TokenLayout>
        <p className="text-sm text-gray-600 mb-4">Invalid token address.</p>
        <BackLink />
      </TokenLayout>
    );
  }

  let tokens: TokenWithMarket[] = [];
  try {
    tokens = await getTokens(); // берём те же токены, что и на главной
  } catch (e) {
    console.error("[TokenPage] getTokens error", e);
  }

  const token = tokens.find(
    (t) => t.token_address?.toLowerCase() === address
  );

  if (!token) {
    return (
      <TokenLayout>
        <p className="text-sm text-gray-600 mb-4">Token not found.</p>
        <BackLink />
      </TokenLayout>
    );
  }

  // ====== ВРЕМЕННО: просто показываем сырые данные токена ======
  // Потом красиво оформим карточку с графиком / Hatchr score и т.п.
  return (
    <TokenLayout>
      <h1 className="text-xl font-semibold mb-2">
        {token.name || "Unnamed token"}{" "}
        {token.symbol ? `(${token.symbol})` : ""}
      </h1>

      <p className="text-sm text-gray-600 mb-4 break-all">
        Address: {token.token_address}
      </p>

      <div className="mb-4 text-sm text-gray-700">
        <div>Source: {token.source}</div>
        {token.price_usd != null && <div>Price (USD): {token.price_usd}</div>}
        {token.market_cap_usd != null && (
          <div>MC (USD): {token.market_cap_usd}</div>
        )}
        {token.volume_24h_usd != null && (
          <div>Vol 24h (USD): {token.volume_24h_usd}</div>
        )}
      </div>

      <pre className="text-xs bg-gray-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(token, null, 2)}
      </pre>

      <div className="mt-4">
        <BackLink />
      </div>
    </TokenLayout>
  );
}

function TokenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hatchr-root">
      <div className="hatchr-shell">
        <h2 className="text-lg font-semibold mb-3">Token</h2>
        {children}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center text-sm text-blue-600 hover:underline"
    >
      ← Back to Hatchr
    </Link>
  );
}
