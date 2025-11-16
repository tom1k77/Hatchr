import { NextRequest, NextResponse } from "next/server";

// тип токена, такой же как в твоём API
type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string;
  price_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  farcaster_url?: string | null;
};

type TokensResponse = {
  count: number;
  items: TokenItem[];
};

const SITE_URL = "https://nextjs-boilerplate-liart-eta-7lpgqo4h3o.vercel.app"; 
// ↑ тут поставь финальный домен Hatchr, когда будет

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const indexFromButton: number | undefined =
    body?.untrustedData?.buttonIndex; // 1,2,...

  // читаем текущий index из state (если есть)
  const prevIndex =
    typeof body?.untrustedData?.state === "string"
      ? Number(body.untrustedData.state)
      : 0;

  let index = prevIndex;
  if (indexFromButton === 2) {
    // кнопка "Next"
    index = prevIndex + 1;
  }

  // тянем токены с твоего API
  const tokensRes = await fetch(`${SITE_URL}/api/tokens`, {
    cache: "no-store",
  });
  const tokensJson: TokensResponse = await tokensRes.json();
  const items = tokensJson.items || [];

  if (!items.length) {
    return frameResponse({
      title: "Hatchr – no tokens yet",
      text: "Нет новых токенов за последний час.",
      image: `${SITE_URL}/api/frame-image?msg=${encodeURIComponent(
        "No tokens yet"
      )}`,
      state: "0",
    });
  }

  // по кругу, чтобы не выходить за длину массива
  const safeIndex = ((index % items.length) + items.length) % items.length;
  const token = items[safeIndex];

  const title = "Hatchr – new Base tokens";
  const text = `${token.name || token.symbol} (${token.symbol || ""})`;
  const state = String(safeIndex);

  // простая картинка через твой API (пока заглушка)
  const imageUrl = `${SITE_URL}/api/frame-image?name=${encodeURIComponent(
    token.name || token.symbol
  )}&symbol=${encodeURIComponent(token.symbol || "")}`;

  return frameResponse({
    title,
    text,
    image: imageUrl,
    state,
  });
}

// GET — чтобы Farcaster мог дернуть первый фрейм как обычную страницу
export async function GET() {
  const imageUrl = `${SITE_URL}/api/frame-image?msg=${encodeURIComponent(
    "Hatchr – new Base tokens"
  )}`;

  return frameResponse({
    title: "Hatchr – new Base tokens",
    text: "Tap to browse new Base tokens.",
    image: imageUrl,
    state: "0",
  });
}

// helper: собираем ответ в формате Farcaster frame
function frameResponse(opts: {
  title: string;
  text: string;
  image: string;
  state: string;
}) {
  const { title, text, image, state } = opts;

  const frame = {
    version: "vNext",
    title,
    image,
    buttons: [
      {
        label: "Open Hatchr",
        action: "link",
        target: SITE_URL,
      },
      {
        label: "Next token",
      },
    ],
    post_url: `${SITE_URL}/frame`,
    state,
    imageAspectRatio: "1.91:1",
    text,
  };

  // Farcaster читает из headers + body (HTML/JSON не важно)
  return new NextResponse(JSON.stringify(frame), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
