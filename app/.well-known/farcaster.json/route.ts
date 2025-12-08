// app/.well-known/farcaster.json/route.ts
import { NextResponse } from "next/server";

const ROOT_URL = process.env.NEXT_PUBLIC_ROOT_URL || "https://hatchr.vercel.app/";

export async function GET() {
  const manifest = {
    accountAssociation: {
      // временно пустые — заполним после шага с account tool
      header: "",
      payload: "",
      signature: "",
    },
    miniapp: {
      version: "1",
      name: "Hatchr",
      subtitle: "Token discovery on Base",
      description:
        "Hatchr helps you discover and track new tokens on Base in real time.",
      screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
      iconUrl: `${ROOT_URL}/hatchr-icon.png`,
      splashImageUrl: `${ROOT_URL}/hatchr-hero.png`,
      splashBackgroundColor: "#020617",
      homeUrl: ROOT_URL,
      webhookUrl: `${ROOT_URL}/api/webhook`, // можешь оставить заглушкой, если вебхуков нет
      primaryCategory: "defi",
      tags: ["base", "tokens", "analytics", "defi"],
      heroImageUrl: `${ROOT_URL}/hatchr-hero.png`,
      tagline: "Discover new Base tokens early.",
      ogTitle: "Hatchr — token discovery on Base",
      ogDescription:
        "Live feed of new Base tokens with on-chain stats and creator info.",
      ogImageUrl: `${ROOT_URL}/hatchr-hero.png`,
    },
  };

  return NextResponse.json(manifest);
}
