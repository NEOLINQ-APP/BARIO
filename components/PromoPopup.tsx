'use client'

import { useEffect, useState } from 'react'

// Upsell popup for BARIO's own dashboard (not customer sites). Free-tier
// accounts see it recur every hour they're active; paid accounts see it
// once per browser session (sessionStorage clears when the tab/browser
// closes, which is a reasonable proxy for "once per login session" without
// needing new server-side state for a marketing popup).
const HOUR_MS = 60 * 60 * 1000

export default function PromoPopup({ isPaid }: { isPaid: boolean }) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    if (isPaid) {
      if (!sessionStorage.getItem('bario_promo_shown_session')) {
        sessionStorage.setItem('bario_promo_shown_session', '1')
        setOpen(true)
      }
      return
    }
    const last = parseInt(localStorage.getItem('bario_promo_last_shown') || '0', 10)
    if (Date.now() - last > HOUR_MS) {
      localStorage.setItem('bario_promo_last_shown', String(Date.now()))
      setOpen(true)
    }
  }, [isPaid])

  if (!open) return null

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        aria-label="Reopen offer"
        className="fixed bottom-4 right-4 z-[999] w-12 h-12 rounded-full bg-[#f59e0b] text-[#1a1200] text-xl shadow-lg flex items-center justify-center"
      >
        🎉
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/55 px-4">
      <div className="relative max-w-sm w-full bg-[#131b2a] border border-zinc-800 rounded-2xl p-7 text-center shadow-2xl">
        <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 text-xl leading-none p-1">×</button>
        <button onClick={() => setMinimized(true)} aria-label="Minimize" className="absolute top-3 right-10 text-zinc-500 hover:text-zinc-300 text-xl leading-none p-1">–</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bario-icon-64.png" alt="Bario" className="w-10 h-10 mx-auto mb-3" />
        <div className="font-extrabold text-lg text-white mb-2">
          {isPaid ? '🎉 A little something for you' : '🎉 Special offer from Bario'}
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5">
          {isPaid
            ? 'Thanks for being a Bario customer — check out what\'s new before you go.'
            : 'Upgrade your plan for a custom domain, more storage, and no badge on your site — special pricing available now.'}
        </p>
        <a
          href="/dashboard/billing"
          className="inline-block bg-[#f59e0b] text-[#1a1200] font-bold text-sm px-7 py-3 rounded-full"
        >
          {isPaid ? 'See plans' : 'See offers'}
        </a>
      </div>
    </div>
  )
}
