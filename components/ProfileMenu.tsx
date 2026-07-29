'use client'

import { useEffect, useRef, useState } from 'react'

export default function ProfileMenu({
  email,
  plan,
  isAdmin,
  creditsLabel,
}: {
  email: string
  plan: string | null
  isAdmin: boolean
  creditsLabel: string
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initial = email.charAt(0).toUpperCase()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-[#1a56db] text-white text-sm font-bold flex items-center justify-center"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-[#131b2a] shadow-2xl z-50 py-2 text-sm">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800">
            <div className="text-slate-800 dark:text-zinc-200 truncate">{email}</div>
            <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 capitalize">
              {plan ?? 'No plan'} {isAdmin && '· Admin'}
            </div>
            <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{creditsLabel}</div>
          </div>
          <a href="/dashboard" className="block px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Account settings</a>
          <a href="/build/templates" className="block px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Premium templates</a>
          {isAdmin && (
            <a href="/admin" className="block px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Admin panel</a>
          )}
          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-red-600 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-zinc-800">
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
