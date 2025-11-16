import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || searchParams.get("msg") || "Hatchr";
  const symbol = searchParams.get("symbol") || "";

  // SVG картинка прямо в ответе (без Canvas, чтобы было проще)
  const svg = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#3b82f6" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)" />
    <text x="80" y="150" fill="#93c5fd" font-size="40" font-family="system-ui, -apple-system, sans-serif">Hatchr · New Base tokens</text>
    <text x="80" y="260" fill="#e5e7eb" font-size="64" font-weight="700" font-family="system-ui, -apple-system, sans-serif">
      ${escapeSvg(name)}
    </text>
    <text x="80" y="330" fill="#bfdbfe" font-size="40" font-family="system-ui, -apple-system, sans-serif">
      ${escapeSvg(symbol)}
    </text>
    <text x="80" y="430" fill="#cbd5f5" font-size="30" font-family="system-ui, -apple-system, sans-serif">
      Scroll in Farcaster to see more tokens
    </text>
  </svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}

function escapeSvg(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
