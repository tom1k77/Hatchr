"use client";

import { useEffect } from "react";

export function FarcasterReady() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Подгружаем SDK только на клиенте
        const mod = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;

        // Если Hatchr открыт внутри Mini App, вызываем ready()
        // В обычном браузере try/catch безопасно всё проглотит
        await mod.sdk.actions.ready();
      } catch {
        // Не миниапп / нет SDK / обычный браузер — ничего не делаем
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
