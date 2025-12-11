// app/frame/route.ts
import { NextRequest, NextResponse } from "next/server";

type TokenItem = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string | null;

  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;

  farcaster_url?: string | null;
};

type TokensResponse = {
  count: number;
  items: TokenItem[];
};

// ТВОЙ домен. Если потом будешь менять — правишь только тут.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hatchr.vercel.app";

// компактное форматирование USD под фрейм
function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "—";
  const abs = Math.abs(value);
  if (abs < 1) return value.toFixed(6);
  if (abs < 10) return value.toFixed(4);
  if (abs < 1_000) return value.toFixed(2);
  if (abs < 1_000_000) return (value / 1_000).toFixed(1) + "K";
  return (value / 1_000_000).toFixed(1) + "M";
}

async function fetchTokens(): Promise<TokenItem[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/tokens`, {
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Frame /api/tokens error:", res.status);
      return [];
    }
    const json: TokensResponse = await res.json();
    return Array.isArray(json.items) ? json.items : [];
  } catch (e) {
    console.error("Frame /api/tokens fetch failed:", e);
    return [];
  }
}

function buildFrameResponse(opts: {
  title: string;
  text: string;
  state: string;
  image?: string;
  hasNext?: boolean;
}) {
  const { title, text, state, image, hasNext } = opts;

  const frame: any = {
    version: "vNext",
    title,
    image:
      image ??
      // простой вариант — логотип Hatchr
      `${SITE_URL}/hatchr-logo.png`,
    imageAspectRatio: "1.91:1",
    text,
    post_url: `${SITE_URL}/frame`,
    state,
    buttons: [
      {
        label: "Open Hatchr",
        action: "link",
        target: SITE_URL,
      },
    ],
  };

  // если есть что листать — добавляем кнопку Next
  if (hasNext) {
    frame.buttons.push({
      label: "Next token",
    });
  }

  return new NextResponse(JSON.stringify(frame), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Первый фрейм (когда просто вставили ссылку)
export async function GET(_req: NextRequest) {
  const tokens = await fetchTokens();
  const first = tokens[0];

  if (!first) {
    return buildFrameResponse({
      title: "Hatchr — Base token radar",
      text: "No fresh Base tokens right now. Open Hatchr for the full feed.",
      state: "0",
      hasNext: false,
    });
  }

  const symbol = first.symbol || "";
  const name = first.name || symbol || "New token";

  const text = `${symbol || name} · MC ${formatUsd(
    first.market_cap_usd
  )} · Vol 24h ${formatUsd(first.volume_24h_usd)}`;

  return buildFrameResponse({
    title: "Hatchr — new Base tokens",
    text,
    state: "0",
    hasNext: tokens.length > 1,
  });
}

// Обработка нажатий в фрейме (Next token)
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const untrusted = body?.untrustedData || {};
  const buttonIndex: number | undefined = untrusted.buttonIndex;
  const prevStateStr: string = typeof untrusted.state === "string"
    ? untrusted.state
    : "0";

  let currentIndex = Number(prevStateStr);
  if (!Number.isFinite(currentIndex)) currentIndex = 0;

  // если нажали 2-ю кнопку — листаем дальше
  if (buttonIndex === 2) {
    currentIndex += 1;
  }

  const tokens = await fetchTokens();
  if (!tokens.length) {
    return buildFrameResponse({
      title: "Hatchr — Base token radar",
      text: "No fresh Base tokens right now. Open Hatchr for the full feed.",
      state: "0",
      hasNext: false,
    });
  }

  // безопасный индекс по кругу
  const safeIndex =
    ((currentIndex % tokens.length) + tokens.length) % tokens.length;

  const token = tokens[safeIndex];
  const symbol = token.symbol || "";
  const name = token.name || symbol || "New token";

  const text = `${symbol || name} · MC ${formatUsd(
    token.market_cap_usd
  )} · Vol 24h ${formatUsd(token.volume_24h_usd)}`;

  return buildFrameResponse({
    title: "Hatchr — new Base tokens",
    text,
    state: String(safeIndex),
    hasNext: tokens.length > 1,
  });
}
