// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// маленький помощник: пробуем несколько URL по очереди
async function fetchFirstOk(urls: string[]) {
  let lastStatus: number | null = null;
  let lastText: string | null = null;

  for (const url of urls) {
    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY || "",
        // у Neynar некоторые поля/фичи реально сидят за experimental
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (resp.ok) {
      const json = await resp.json();
      return { ok: true as const, url, json };
    }

    lastStatus = resp.status;
    try {
      lastText = await resp.text();
    } catch {
      lastText = null;
    }
  }

  return { ok: false as const, status: lastStatus ?? 500, body: lastText };
}

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "Missing NEYNAR_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");

    if (!fidParam && !usernameParam) {
      return NextResponse.json({ error: "Missing fid or username" }, { status: 400 });
    }

    // ВАЖНО: сначала пытаемся по FID — это самый стабильный идентификатор
    const fid = fidParam ? Number(fidParam) : null;
    const username = usernameParam ? String(usernameParam) : null;

    const urls: string[] = [];

    if (fid && Number.isFinite(fid)) {
      // варианты, потому что у Neynar бывает несколько “правильных” путей в разных версиях
      urls.push(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`,
        `https://api.neynar.com/v2/farcaster/user?fid=${encodeURIComponent(String(fid))}`,
      );
    } else if (username) {
      // если вдруг FID нет — пробуем по username
      // (username сюда уже приходит без encode)
      urls.push(
        `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`,
        `https://api.neynar.com/v2/farcaster/user?username=${encodeURIComponent(username)}`
      );
    }

    const result = await fetchFirstOk(urls);

    if (!result.ok) {
      console.error("Neynar user error", result.status, result.body);
      return NextResponse.json(
        {
          error: "Failed Neynar",
          status: result.status,
        },
        { status: 500 }
      );
    }

    const json: any = result.json;

    // Нормализация: разные endpoints возвращают по-разному
    // bulk обычно отдаёт users: []
    const user =
      json?.user ??
      json?.result?.user ??
      (Array.isArray(json?.users) ? json.users[0] : null) ??
      (Array.isArray(json?.result?.users) ? json.result.users[0] : null) ??
      json;

    // Достаём neynar score из нескольких потенциальных мест
    const candidates = [
      user?.score,
      user?.neynar_user_score,
      user?.experimental?.neynar_user_score,
      user?.experimental?.user_score,
      user?.viewer_context?.neynar_user_score,
    ];

    let score: number | null = null;
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        score = c;
        break;
      }
    }

    return NextResponse.json({
      fid: fid ?? user?.fid ?? null,
      username: user?.username ?? username ?? null,
      neynar_score: score,
      // на будущее: можно вернуть сырой user, но лучше не надо в проде
      // debug_source: result.url,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json({ error: "Internal error in token-score" }, { status: 500 });
  }
}
