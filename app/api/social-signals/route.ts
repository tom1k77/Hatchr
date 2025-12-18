import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "25"), 100);

  const { rows } = await sql`
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

  return NextResponse.json({ items: rows });
}
