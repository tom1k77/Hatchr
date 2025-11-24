// app/api/zora-debug/route.ts
import { NextResponse } from "next/server";

const ZORA_BASE_URL = "https://api-sdk.zora.engineering";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

// простой helper, чтобы сходить к Zora
async function fetchFromZora(path: string, params: Record<string, string>) {
  if (!ZORA_API_KEY) {
    return NextResponse.json(
      { error: "ZORA_API_KEY is not set" },
      { status: 500 }
    );
  }

  const url = new URL(path, ZORA_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "api-key": ZORA_API_KEY,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // оставим как есть
  }

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    url: url.toString(),
    raw: json ?? text,
  });
}

// GET /api/zora-debug
// Можно дописать query-параметры потом, но для начала достаточно
export async function GET() {
  // пример: тот же список NEW_CREATORS, который ты уже используешь
  return fetchFromZora("/explore", {
    listType: "NEW_CREATORS",
    count: "5",
  });
}
