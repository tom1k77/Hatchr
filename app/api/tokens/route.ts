// app/api/tokens/route.ts

import { NextResponse } from "next/server";
import { getTokens } from "@/lib/providers";

export async function GET() {
  const data = await getTokens();
  return NextResponse.json(data);
}
