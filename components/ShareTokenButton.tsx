"use client";

import { useCallback } from "react";
import { getTokenShareIntentUrl, buildTokenShareText, getTokenUrl } from "@/lib/shareToken";

export function ShareTokenButton({
  tokenName,
  tokenIdOrAddress,
}: {
  tokenName: string;
  tokenIdOrAddress: string;
}) {
  const onShare = useCallback(async () => {
    const text = buildTokenShareText(tokenName);
    const embedUrl = getTokenUrl(tokenIdOrAddress);

    // 1) Если мы внутри Farcaster/Base mini app — открываем нативный composer
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({ text, embeds: [embedUrl] });
      return;
    } catch {
      // игнор, уйдем в fallback
    }

    // 2) Fallback: warpcast intent
    const intentUrl = getTokenShareIntentUrl(tokenName, tokenIdOrAddress);
    window.open(intentUrl, "_blank", "noopener,noreferrer");
  }, [tokenName, tokenIdOrAddress]);

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
      aria-label="Share on Farcaster"
      title="Share on Farcaster"
    >
      Share
    </button>
  );
}
