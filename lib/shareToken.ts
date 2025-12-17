export function buildTokenShareText(tokenName: string) {
  return `${tokenName} spotted on Hatchr 👀\nLook what else is trending on Base.`;
}

export function getTokenUrl(tokenAddress: string) {
  // deep link на твою текущую страницу (у тебя /token?address=...)
  // Важно: embed должен быть абсолютным URL
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "https://hatchr.xyz";

  return `${origin}/token?address=${encodeURIComponent(tokenAddress)}`;
}

export function getTokenShareIntentUrl(tokenName: string, tokenAddress: string) {
  const text = buildTokenShareText(tokenName);
  const embedUrl = getTokenUrl(tokenAddress);

  return (
    `https://warpcast.com/~/compose?` +
    `text=${encodeURIComponent(text)}` +
    `&embeds[]=${encodeURIComponent(embedUrl)}`
  );
}
