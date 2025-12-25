"use client";

import Link from "next/link";
import { useIsMobile } from "../hooks/useIsMobile";
import { usePathname } from "next/navigation";
import { SocialSignalsSection } from "@/components/SocialSignalsSection";

export const dynamic = "force-dynamic";

const ENABLE_SOCIAL_SIGNALS = true;

type BottomTabKey = "new" | "signals" | "trending" | "api";

/* ===== Mobile Bottom Navigation (тот же стиль, что и на главной) ===== */
function MobileBottomNav({ active }: { active: BottomTabKey }) {
  const itemBase: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "10px 8px",
    borderRadius: 16,
    textDecoration: "none",
    fontSize: 11,
    lineHeight: 1,
    userSelect: "none",
  };

  const activeStyle: React.CSSProperties = {
    background: "#111827",
    color: "#ffffff",
  };

  const inactiveStyle: React.CSSProperties = {
    background: "transparent",
    color: "#6b7280",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        padding: "10px 12px",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          display: "flex",
          gap: 6,
          padding: 6,
        }}
      >
        <Link
          href="/"
          style={{ ...itemBase, ...(active === "new" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>⚡️</span>
          <span>New</span>
        </Link>

        <Link
          href="/social-signals"
          style={{ ...itemBase, ...(active === "signals" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>📣</span>
          <span>Signals</span>
        </Link>

        {/* Заглушки, как и на главной */}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ ...itemBase, ...(active === "trending" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>📊</span>
          <span>Trending</span>
        </a>

        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ ...itemBase, ...(active === "api" ? activeStyle : inactiveStyle) }}
        >
          <span style={{ fontSize: 18 }}>👥</span>
          <span>API</span>
        </a>
      </div>
    </div>
  );
}

export default function SocialSignalsPage() {
  const isMobile = useIsMobile();
  const pathname = usePathname();

  const activeTab: BottomTabKey = pathname?.startsWith("/social-signals")
    ? "signals"
    : "new";

  return (
    <div className="hatchr-root">
      {/* padding-bottom, чтобы контент не прятался под bottom nav */}
      <main
        className="hatchr-shell"
        style={{ paddingBottom: isMobile ? 110 : undefined }}
      >
        {/* top bar */}
        <div className="hatchr-topbar">
          <div className="hatchr-brand">
            <div className="hatchr-brand-logo-circle">
              <img src="/hatchr-logo.png" alt="Hatchr" />
            </div>
            <div className="hatchr-brand-title">
              <span className="hatchr-brand-title-main">Hatchr</span>
              <span className="hatchr-brand-title-sub">
                Analytics layer for Base. Discover new tokens on Base live.
              </span>
            </div>
          </div>

          {/* Верхние табы — только на десктопе */}
          {!isMobile && (
            <nav className="hatchr-nav">
              <Link href="/" className="hatchr-nav-pill">
                New tokens
              </Link>
              <span className="hatchr-nav-pill primary">Social signals</span>
              <span className="hatchr-nav-pill">Trending</span>
              <span className="hatchr-nav-pill">API</span>
            </nav>
          )}
        </div>

        {/* content */}
        <div className="hatchr-main-grid">
          <section>
            {ENABLE_SOCIAL_SIGNALS ? (
              <SocialSignalsSection />
            ) : (
              <div style={{ opacity: 0.6, fontSize: 14 }}>
                Social signals are temporarily disabled.
              </div>
            )}
          </section>

          {/* правая колонка — пока пустая */}
          <aside />
        </div>
      </main>

      {/* Нижняя навигация — только на мобилке */}
      {isMobile && <MobileBottomNav active={activeTab} />}
    </div>
  );
}
