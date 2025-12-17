// lib/shareToken.ts
export function buildTokenShareText(tokenName: string) {
  return `${tokenName} spotted on Hatchr 👀\nLook what else is trending on Base.`;
}

export function getTokenUrl(tokenIdOrAddress: string) {
  return `https://hatchr.xyz/token/${tokenIdOrAddress}`;
}

export function getTokenShareIntentUrl(tokenName: string, tokenIdOrAddress: string) {
  const text = buildTokenShareText(tokenName);
  const tokenUrl = getTokenUrl(tokenIdOrAddress);

  // Warpcast compose intent (text + 1 embed)
  return (
    `https://warpcast.com/~/compose?` +
    `text=${encodeURIComponent(text)}` +
    `&embeds[]=${encodeURIComponent(tokenUrl)}`
  );
}
