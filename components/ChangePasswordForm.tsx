'use client'

import { useState } from 'react'
import PasswordInput from '@/components/PasswordInput'

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to change password')
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Current password</label>
        <PasswordInput value={currentPassword} onChange={setCurrentPassword} />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">New password</label>
        <PasswordInput value={newPassword} onChange={setNewPassword} minLength={8} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">Password updated.</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-lg border border-zinc-700 text-xs font-semibold disabled:opacity-50"
      >
        {loading ? 'Updating…' : 'Change Password'}
      </button>
    </form>
  )
}
