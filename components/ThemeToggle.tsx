'use client'

import { useEffect, useState } from 'react'

// Default theme is dark (matches Bario's established brand), stored choice
// overrides it. The blocking script in app/layout.tsx strips the `dark`
// class before paint for returning light-mode users, so this component only
// needs to sync its own displayed state on mount, not decide the theme.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('bario-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full border transition-colors ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
      } ${className}`}
      style={{ width: '3.25rem' }}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow text-[10px] leading-none transition-transform ${
          isDark ? 'translate-x-[1.7rem]' : 'translate-x-1'
        }`}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  )
}
