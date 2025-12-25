'use client'

import { useCallback } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'

export function EnableAlertsButton() {
  const onClick = useCallback(async () => {
    try {
      await sdk.actions.addMiniApp()
      alert('Done! Notifications are enabled (if not disabled in settings).')
    } catch (e) {
      alert('Open Hatchr inside Farcaster/Warpcast to enable alerts.')
    }
  }, [])

  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded bg-black text-white"
    >
      🔔 Enable alerts
    </button>
  )
}
