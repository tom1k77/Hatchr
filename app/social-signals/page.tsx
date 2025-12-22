import Link from "next/link";
import { SocialSignalsSection } from "@/components/SocialSignalsSection";

export const dynamic = "force-dynamic";

const ENABLE_SOCIAL_SIGNALS = true;

export default function SocialSignalsPage() {
  return (
    <div className="hatchr-root">
      <main className="hatchr-shell">
        {/* top bar (same style as home) */}
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

          <nav className="hatchr-nav">
            <Link href="/" className="hatchr-nav-pill">
              New tokens
            </Link>
            <span className="hatchr-nav-pill primary">Social signals</span>
            <span className="hatchr-nav-pill">Trending</span>
            <span className="hatchr-nav-pill">API</span>
          </nav>
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

          {/* правая колонка можно оставить пустой или позже добавить */}
          <aside />
        </div>
      </main>
    </div>
  );
}
