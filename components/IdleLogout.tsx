'use client'

import { useEffect, useRef } from 'react'

// Auto-logs out after 10 minutes with zero activity anywhere in the account
// area (mouse, keyboard, touch, scroll all count as activity) — the 30-day
// session cookie itself (lib/session.ts) still keeps someone logged in across
// normal navigation/tab-close/reopen; this only kicks in on genuine idle.
const IDLE_LIMIT_MS = 10 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export default function IdleLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function logout() {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/login?idle=1'
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(logout, IDLE_LIMIT_MS)
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return null
}
