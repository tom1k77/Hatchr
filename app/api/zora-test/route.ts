import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.ZORA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ZORA_API_KEY missing" }, { status: 500 });
    }

    // ⚠️ Возьми любой реальный Zora coin на Base
    const address = "0x4200000000000000000000000000000000000006"; // пример
    const chain = 8453;

    const url = `https://api-sdk.zora.engineering/coin?address=${address}&chain=${chain}`;

    const res = await fetch(url, {
      headers: {
        "api-key": apiKey,
        "accept": "application/json",
      },
      cache: "no-store"
    });

    const text = await res.text();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      url,
      response: text
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}
