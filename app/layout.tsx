import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

import { FarcasterReady } from "./farcaster-ready";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hatchr",
  description: "Token discovery & signal platform",
};

const SITE_URL = "https://hatchr.vercel.app"; // <-- ПРОД-ДОМЕН, поменяй если нужно
const PREVIEW_IMAGE = `${SITE_URL}/branding/Hatchr-PreviewImage.PNG`; // проверь что файл реально доступен

// Farcaster Mini App embed
const MINIAPP_EMBED = JSON.stringify({
  version: "1",
  imageUrl: PREVIEW_IMAGE,
  button: {
    title: "Open Hatchr",
    action: {
      type: "launch_miniapp",
      name: "Hatchr",
      url: SITE_URL,
    },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Base App */}
        <meta name="base:app_id" content="69397bfe8a7c4e55fec73d03" />

        {/* Farcaster Mini App embed */}
        <meta name="fc:miniapp" content={MINIAPP_EMBED} />
        {/* Backward compatibility */}
        <meta name="fc:frame" content={MINIAPP_EMBED} />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Signal Farcaster Mini App that UI is ready */}
        <FarcasterReady />

        {children}

        <Analytics />
      </body>
    </html>
  );
}
