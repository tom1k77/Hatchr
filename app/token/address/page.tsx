// app/token/[address]/page.tsx
import { notFound } from "next/navigation";
import { getTokens } from "@/lib/providers";

export const dynamic = "force-dynamic"; // чтобы Next не пытался статически экспортить все адреса

type PageProps = {
  params: {
    address?: string | string[];
  };
};

export default async function TokenPage({ params }: PageProps) {
  // безопасно достаём address
  const rawAddress = Array.isArray(params.address)
    ? params.address[0]
    : params.address;

  if (typeof rawAddress !== "string" || !rawAddress) {
    // если адреса нет — 404, а не крэш билда
    notFound();
  }

  const address = rawAddress.toLowerCase();

  // берём те же токены, что и на главной
  const tokens = await getTokens();
  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    notFound();
  }

  const name = token.name || token.symbol || "New token";
  const symbol = token.symbol || "";
  const sourceLabel = token.source === "clanker" ? "Clanker" : "Zora";

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        {name} {symbol && symbol !== name ? `(${symbol})` : ""}
      </h1>
      <p style={{ marginBottom: 16, color: "#6b7280" }}>
        Address: {token.token_address}
      </p>
      <p style={{ marginBottom: 8 }}>Source: {sourceLabel}</p>
      <p style={{ marginBottom: 8 }}>
        MC: {token.market_cap_usd ?? "—"} · Vol 24h:{" "}
        {token.volume_24h_usd ?? "—"}
      </p>
      {token.source_url && (
        <a
          href={token.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "8px 16px",
            borderRadius: 999,
            background: "#0052ff",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          View on {sourceLabel}
        </a>
      )}
    </main>
  );
}
