import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Farcaster will hit this URL to verify it's reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Optional: log payload for debugging
  try {
    const body = await req.json().catch(() => null);
    console.log("FC webhook POST:", body);
  } catch {}

  return NextResponse.json({ ok: true });
}
