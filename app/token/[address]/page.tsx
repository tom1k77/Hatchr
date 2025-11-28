// app/token/[address]/page.tsx

import Link from "next/link";
import { getTokens, type TokenWithMarket } from "@/lib/providers";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { address: string };
};

export default async function TokenPage({ params }: PageProps) {
  const address = decodeURIComponent(params.address || "").toLowerCase();

  // НИКАКОЙ строгой проверки длины — работаем только с тем, что есть
  if (!address || !address.startsWith("0x")) {
    return (
      <Shell>
        <Title>Token</Title>
        <p className="text-sm text-gray-600 mb-4">Invalid token address.</p>
        <BackLink />
      </Shell>
    );
  }

  let tokens: TokenWithMarket[] = [];
  try {
    // Берём те же данные, что и на главной, напрямую
    tokens = await getTokens();
  } catch (e) {
    console.error("[token page] getTokens error", e);
    return (
      <Shell>
        <Title>Token</Title>
        <p className="text-sm text-gray-600 mb-4">
          Error loading token data. Try again in a minute.
        </p>
        <BackLink />
      </Shell>
    );
  }

  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    return (
      <Shell>
        <Title>Token</Title>
        <p className="text-sm text-gray-600 mb-4">Token not found.</p>
        <BackLink />
      </Shell>
    );
  }

  const shortAddress =
    token.token_address.slice(0, 6) +
    "..." +
    token.token_address.slice(-4);

  return (
    <Shell>
      <Title>{token.name || token.symbol || shortAddress}</Title>

      <div className="mt-2 text-sm text-gray-600">
        {token.symbol && (
          <p className="mb-1">
            <span className="text-gray-400">Symbol:</span> {token.symbol}
          </p>
        )}
        <p className="mb-1">
          <span className="text-gray-400">Address:</span> {shortAddress}
        </p>
        {token.source && (
          <p className="mb-1">
            <span className="text-gray-400">Source:</span> {token.source}
          </p>
        )}
        {token.market_cap_usd != null && (
          <p className="mb-1">
            <span className="text-gray-400">MC:</span>{" "}
            {token.market_cap_usd.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </p>
        )}
        {token.volume_24h_usd != null && (
          <p className="mb-1">
            <span className="text-gray-400">Vol 24h:</span>{" "}
            {token.volume_24h_usd.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </p>
        )}
      </div>

      <BackLink className="mt-6" />
    </Shell>
  );
}

/* ===== маленькие помощники ===== */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="hatchr-root">
      <div className="hatchr-shell">{children}</div>
    </main>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl font-semibold mb-3">{children}</h1>;
}

function BackLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center text-sm text-blue-600 hover:underline ${className}`}
    >
      ← Back to Hatchr
    </Link>
  );
}
