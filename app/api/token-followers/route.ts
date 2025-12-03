// app/api/token-followers/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

type Follower = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
};

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json(
        { error: "Missing NEYNAR_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    const baseUrl = `https://api.neynar.com/v2/farcaster/followers?fid=${fid}&limit=200`;

    let cursor: string | null = null;
    const headers = {
      "x-api-key": NEYNAR_API_KEY,
      "x-neynar-experimental": "true",
    };

    const followers: Follower[] = [];

    // простая пагинация, ограничим условно ~1000 фолловеров
    while (true) {
      const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;

      const resp = await fetch(url, {
        headers,
        cache: "no-store",
      });

      if (!resp.ok) {
        console.error("followers error status", resp.status);
        break;
      }

      const json = await resp.json();

      const list = (json.users || []).map((item: any) => {
        const u = item.user || item.app || item;
        return {
          fid: u.fid,
          username: u.username,
          display_name: u.display_name,
          pfp_url: u.pfp_url,
        } as Follower;
      });

      followers.push(...list);

      if (!json.next?.cursor) break;
      cursor = json.next.cursor;

      if (followers.length >= 1000) break;
    }

    // категории
    const ultraOg = followers.filter((f) => f.fid < 1000);
    const og = followers.filter((f) => f.fid >= 1000 && f.fid < 10000);
    const others = followers.filter((f) => f.fid >= 10000);

    return NextResponse.json({
      creator_fid: Number(fid),
      total: followers.length,
      ultraOg,
      og,
      others,
    });
  } catch (e) {
    console.error("followers error", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
