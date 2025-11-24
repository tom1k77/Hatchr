// app/api/zora-mapped-debug/route.ts
import { NextResponse } from "next/server";
import { fetchTokensFromZora } from "@/lib/providers";

export async function GET() {
  const tokens = await fetchTokensFromZora();
  return NextResponse.json(tokens, { status: 200 });
}
