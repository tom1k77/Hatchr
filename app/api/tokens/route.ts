// app/api/tokens/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // СЫРОЙ запрос к Clanker — без параметров
    const res = await fetch("https://www.clanker.world/api/tokens", {
      cache: "no-store",
    });

    const text = await res.text();

    // Просто возвращаем как есть, чтобы увидеть, что он шлёт
    return new NextResponse(text, {
      headers: { "content-type": "application/json; charset=utf-8" },
      status: res.status,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500 }
    );
  }
}
