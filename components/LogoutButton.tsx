'use client'

export default function LogoutButton() {
  async function handleClick() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }
  return (
    <button onClick={handleClick} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-sm hover:border-slate-400 dark:hover:border-zinc-600 transition-colors">
      Log out
    </button>
  )
}
