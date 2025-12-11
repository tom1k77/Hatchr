// app/frame/route.ts
import { NextRequest, NextResponse } from "next/server";

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

// твой текущий домен Hatchr
const SITE_URL = "https://hatchr.vercel.app";

// --------- GET: первая загрузка / превью в Warpcast ---------
export async function GET() {
  const imageUrl = `${SITE_URL}/hatchr-logo.png`;

  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Hatchr – Base token radar</title>
    <meta property="og:title" content="Hatchr – Base token radar" />
    <meta property="og:image" content="${imageUrl}" />
    <meta name="fc:frame" content="vNext" />
    <meta name="fc:frame:image" content="${imageUrl}" />
    <meta name="fc:frame:image:aspect_ratio" content="1.91:1" />
    <meta name="fc:frame:button:1" content="Open Hatchr" />
    <meta name="fc:frame:button:1:action" content="link" />
    <meta name="fc:frame:button:1:target" content="${SITE_URL}" />
    <meta name="fc:frame:button:2" content="Next token" />
    <meta name="fc:frame:post_url" content="${SITE_URL}/frame" />
  </head>
  <body></body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// --------- POST: логика кнопки "Next token" ---------
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const buttonIndex: number | undefined = body?.untrustedData?.buttonIndex;
  const prevState =
    typeof body?.untrustedData?.state === "string"
      ? Number(body.untrustedData.state)
      : 0;

  // если нажали “Next token” (кнопка 2) — двигаем индекс
  let index = prevState;
  if (buttonIndex === 2) {
    index = prevState + 1;
  }

  // забираем токены из твоего API
  const tokensRes = await fetch(`${SITE_URL}/api/tokens`, {
    cache: "no-store",
  });

  if (!tokensRes.ok) {
    // если что-то сломалось — показываем заглушку
    return frameJsonResponse({
      title: "Hatchr – error",
      text: "Could not load tokens.",
      image: `${SITE_URL}/hatchr-logo.png`,
      state: String(prevState),
    });
  }

  const tokensJson: TokensResponse = await tokensRes.json();
  const items = tokensJson.items || [];

  if (!items.length) {
    return frameJsonResponse({
      title: "Hatchr – no tokens",
      text: "No new Base tokens yet.",
      image: `${SITE_URL}/hatchr-logo.png`,
      state: "0",
    });
  }

  const safeIndex = ((index % items.length) + items.length) % items.length;
  const token = items[safeIndex];

  const title = "Hatchr – new Base tokens";
  const text = `${token.name || token.symbol} (${token.symbol || ""})`;
  const state = String(safeIndex);

  const imageUrl = `${SITE_URL}/api/frame-image?name=${encodeURIComponent(
    token.name || token.symbol
  )}&symbol=${encodeURIComponent(token.symbol || "")}`;

  return frameJsonResponse({
    title,
    text,
    image: imageUrl,
    state,
  });
}

// helper: ответ в формате vNext JSON
function frameJsonResponse(opts: {
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
    imageAspectRatio: "1.91:1",
    text,
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
  };

  return new NextResponse(JSON.stringify(frame), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
