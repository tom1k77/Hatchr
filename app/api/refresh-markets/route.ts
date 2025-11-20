// app/api/refresh-markets/route.ts
import { NextResponse } from "next/server";
import { fetchTokensFromClanker, fetchTokensFromZora } from "@/lib/providers";
import { updateMarketsForTokens } from "@/lib/markets";

const WINDOW_MS = 3 * 60 * 60 * 1000; // те же 3 часа

export async function GET() {
  const now = Date.now();

  try {
    const [clanker, zora] = await Promise.all([
      fetchTokensFromClanker(),
      fetchTokensFromZora(),
    ]);

    let all = [...clanker, ...zora];

    // фильтр по окну (чтобы не обновлять вечную историю)
    all = all.filter((t) => {
      if (!t.first_seen_at) return true;
      const ts = new Date(t.first_seen_at).getTime();
      if (!ts || Number.isNaN(ts)) return false;
      return now - ts <= WINDOW_MS;
    });

    // убираем дубликаты по адресу
    const map = new Map<string, typeof all[0]>();
    for (const t of all) {
      map.set(t.token_address.toLowerCase(), t);
    }
    const unique = Array.from(map.values());

    await updateMarketsForTokens(unique);

    return NextResponse.json({
      ok: true,
      updated: unique.length,
    });
  } catch (e) {
    console.error("[refresh-markets] error", e);
    return NextResponse.json(
      { ok: false, error: "refresh failed" },
      { status: 500 }
    );
  }
}
