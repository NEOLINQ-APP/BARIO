'use client'

import { useEffect, useState } from 'react'

export default function PayrollSettings() {
  const [open, setOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [employer, setEmployer] = useState({ name: '', address: '', businessNumber: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings/logo').then((r) => r.json()).then((d) => d.ok && setLogoUrl(d.url))
    fetch('/api/admin/settings/employer').then((r) => r.json()).then((d) => d.ok && setEmployer({ name: d.name, address: d.address, businessNumber: d.businessNumber }))
  }, [])

  async function uploadLogo(file: File) {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/settings/logo', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setLogoUrl(data.url)
    } catch (err: any) {
      setError(err.message)
    }
    setUploading(false)
  }

  async function saveEmployer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/employer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(employer),
      })
      if (!res.ok) throw new Error('Could not save')
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold flex items-center gap-2">
        ⚙️ Document logo & employer info {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded object-contain bg-white" />}
            <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs cursor-pointer">
              {uploading ? 'Uploading…' : 'Upload custom logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              />
            </label>
            <span className="text-xs text-slate-500 dark:text-zinc-500">Used on invoices & paystubs. PNG/JPEG/SVG, under 2MB.</span>
          </div>

          <form onSubmit={saveEmployer} className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Employer info (shown on paystubs)</p>
            <input
              placeholder="Legal business name"
              value={employer.name}
              onChange={(e) => setEmployer((s) => ({ ...s, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              placeholder="Business address"
              value={employer.address}
              onChange={(e) => setEmployer((s) => ({ ...s, address: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              placeholder="CRA Business Number / payroll account (e.g. 123456789RP0001)"
              value={employer.businessNumber}
              onChange={(e) => setEmployer((s) => ({ ...s, businessNumber: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs disabled:opacity-50">
              {saving ? 'Saving…' : 'Save employer info'}
            </button>
          </form>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
