'use client'

export default function LogoutButton() {
  async function handleClick() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }
  return (
    <button onClick={handleClick} className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 text-sm">
      Log out
    </button>
  )
}
