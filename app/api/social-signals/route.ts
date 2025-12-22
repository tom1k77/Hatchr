import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") ?? "25"), 100);

  // опционально: фильтр по минимальному скору (если передашь ?minScore=0.9)
  const minScoreParam = searchParams.get("minScore");
  const minScoreNum =
    minScoreParam != null && minScoreParam !== ""
      ? Number(minScoreParam)
      : null;

  const result =
    typeof minScoreNum === "number" && Number.isFinite(minScoreNum)
      ? await sql`
          select
            cast_hash,
            cast_timestamp,
            warpcast_url,
            text,
            author_fid,
            author_username,
            author_display_name,
            author_pfp_url,
            author_score,
            tickers,
            contracts
          from social_signals
          where author_score >= ${minScoreNum}
          order by coalesce(cast_timestamp, created_at) desc
          limit ${limit};
        `
      : await sql`
          select
            cast_hash,
            cast_timestamp,
            warpcast_url,
            text,
            author_fid,
            author_username,
            author_display_name,
            author_pfp_url,
            author_score,
            tickers,
            contracts
          from social_signals
          order by coalesce(cast_timestamp, created_at) desc
          limit ${limit};
        `;

  return NextResponse.json({ items: result.rows });
}
