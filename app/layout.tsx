import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// 👇 ДОБАВЛЕНО
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
  description: "Base-native token discovery & signal platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="base:app_id"
          content="69397bfe8a7c4e55fec73d03"
        />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* 👇 ВАЖНО: сигнал Mini App, что UI готов */}
        <FarcasterReady />

        {children}

        {/* Vercel Web Analytics */}
        <Analytics />
      </body>
    </html>
  );
}
