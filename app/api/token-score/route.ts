// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY as string | undefined;

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json(
        { error: "Missing NEYNAR_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { error: "Missing username" },
        { status: 400 }
      );
    }

    const url = `https://api.neynar.com/v2/farcaster/user?username=${encodeURIComponent(
      username
    )}`;

    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Neynar error", resp.status);
      return NextResponse.json(
        { error: "Failed Neynar" },
        { status: 500 }
      );
    }

    const json = await resp.json();
    const user: any = json?.user;

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // --- исходные данные Neynar ---
    const neynarScoreRaw: number =
      typeof user.experimental?.neynar_user_score === "number"
        ? user.experimental.neynar_user_score
        : typeof user.score === "number"
        ? user.score
        : 0;

    const followerCount: number =
      typeof user.follower_count === "number" ? user.follower_count : 0;

    const followingCount: number =
      typeof user.following_count === "number" ? user.following_count : 0;

    const hasEthVerification: boolean =
      Array.isArray(user.verified_addresses?.eth_addresses) &&
      user.verified_addresses.eth_addresses.length > 0;

    const hasXVerification: boolean =
      Array.isArray(user.verified_accounts) &&
      user.verified_accounts.some(
        (acc: any) => acc?.platform?.toLowerCase() === "x"
      );

    // --- компоненты Hatchr Score v1 ---

    // 1) размер аудитории: log10(followers) → 0..~40, потом нормализуем
    const followerScore =
      Math.log10(Math.max(followerCount, 1)) * 20; // 0.. ~80 при 10^4–10^5

    // 2) баланс followers / following (наказание за "follows 10k / followers 100")
    const ratio = followerCount / Math.max(followingCount, 1);
    // от -10 до +10
    const ratioScore = Math.min(
      10,
      Math.max(-10, (ratio - 0.5) * 10)
    );

    // 3) верификации
    const verificationBonus =
      (hasEthVerification ? 8 : 0) + (hasXVerification ? 4 : 0);

    // 4) сам Neynar score (обычно в диапазоне 0–100)
    const neynarScore = Math.max(0, neynarScoreRaw);

    // финальная формула (весовая комбинация)
    let hatchrScoreRaw =
      neynarScore * 0.6 + // база от Neynar
      followerScore * 0.25 +
      ratioScore * 0.1 +
      verificationBonus;

    // clamp 0–100 и округляем
    const hatchrScore = Math.round(
      Math.min(100, Math.max(0, hatchrScoreRaw))
    );

    return NextResponse.json({
      username,
      // главный Hatchr Score — под него уже заточен фронт
      score: hatchrScore,
      // доп. поля на будущее/отладку
      neynar_score: neynarScore,
      follower_count: followerCount,
      following_count: followingCount,
      components: {
        followerScore,
        ratioScore,
        verificationBonus,
        neynarScore,
      },
    });
  } catch (e) {
    console.error("token-score error", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
