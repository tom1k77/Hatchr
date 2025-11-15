// app/api/tokens/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLANKER_URL =
  "https://www.clanker.world/api/tokens?sort=desc&limit=50";

export async function GET() {
  let status = 0;
  let raw: any = null;

  try {
    const res = await fetch(CLANKER_URL, {
      // без кэша, чтобы точно видеть живой ответ
      cache: "no-store",
    });

    status = res.status;

    try {
      raw = await res.json();
    } catch (e) {
      raw = { jsonError: String(e) };
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "fetch_failed",
        message: String(e),
        count: 0,
        items: [],
      },
      { status: 500 }
    );
  }

  // Пытаемся найти массив токенов в разных местах
  let items: any[] = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && Array.isArray(raw.items)) {
    items = raw.items;
  } else if (raw && Array.isArray(raw.data)) {
    items = raw.data;
  } else if (raw?.data && Array.isArray(raw.data.items)) {
    items = raw.data.items;
  }

  const sample = items[0] ?? null;

  return NextResponse.json(
    {
      // отладочная инфа
      clankerStatus: status,
      rawType: raw === null ? "null" : typeof raw,
      topKeys:
        raw && typeof raw === "object" ? Object.keys(raw) : null,
      count: items.length,
      sampleItem: sample,

      // чтобы главный экран не ломался — возвращаем items
      items,
    },
    { status: 200 }
  );
}
