// app/token/[address]/page.tsx

import React from "react";
import { getTokens } from "@/lib/providers";

type TokenPageProps = {
  params: { address?: string };
};

export const dynamic = "force-dynamic";

export default async function TokenPage({ params }: TokenPageProps) {
  // берём то, что в URL, декодируем и приводим к нижнему регистру
  const rawAddress = params.address ?? "";
  const address = decodeURIComponent(rawAddress).trim().toLowerCase();

  // НЕ делаем никаких регекспов, длины и т.п.
  if (!address) {
    return (
      <div
        style={{
          padding: "24px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            width: "100%",
            background: "#f9fafb",
            borderRadius: "16px",
            padding: "18px 20px",
          }}
        >
          <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: 8 }}>
            Token
          </h1>
          <p style={{ fontSize: "14px", marginBottom: 16 }}>
            Invalid token address.
          </p>
          <a href="/" style={{ fontSize: "13px", textDecoration: "underline" }}>
            ← Back to Hatchr
          </a>
        </div>
      </div>
    );
  }

  // тянем все токены так же, как на главной
  const tokens = await getTokens();

  // ищем точное совпадение по адресу (без проверки длины/формата)
  const token = tokens.find(
    (t) => t.token_address.toLowerCase() === address
  );

  if (!token) {
    return (
      <div
        style={{
          padding: "24px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            width: "100%",
            background: "#f9fafb",
            borderRadius: "16px",
            padding: "18px 20px",
          }}
        >
          <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: 8 }}>
            Token
          </h1>
          <p style={{ fontSize: "14px", marginBottom: 16 }}>Token not found.</p>
          <a href="/" style={{ fontSize: "13px", textDecoration: "underline" }}>
            ← Back to Hatchr
          </a>
        </div>
      </div>
    );
  }

  // простейший вывод данных токена — потом оформим красиво
  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          width: "100%",
          background: "#f9fafb",
          borderRadius: "16px",
          padding: "18px 20px",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: 12 }}>
          {token.name || token.symbol || token.token_address}
        </h1>

        <p style={{ fontSize: "13px", marginBottom: 4 }}>
          <strong>Address:</strong> {token.token_address}
        </p>
        <p style={{ fontSize: "13px", marginBottom: 4 }}>
          <strong>Source:</strong> {token.source}
        </p>
        <p style={{ fontSize: "13px", marginBottom: 4 }}>
          <strong>MC:</strong> {token.market_cap_usd ?? "—"}
        </p>
        <p style={{ fontSize: "13px", marginBottom: 4 }}>
          <strong>Vol 24h:</strong> {token.volume_24h_usd ?? "—"}
        </p>

        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: 16,
            fontSize: "13px",
            textDecoration: "underline",
          }}
        >
          ← Back to Hatchr
        </a>
      </div>
    </div>
  );
}
