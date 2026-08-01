'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Template = {
  id: string
  title: string
  category: string
  description: string
  is_premium: boolean
  price_cents: number
}

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [html, setHtml] = useState('')
  const [isPremium, setIsPremium] = useState(true)
  const [price, setPrice] = useState('49')

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    setHtml(text)
    if (!title.trim()) {
      const match = text.match(/<title[^>]*>([^<]*)<\/title>/i)
      if (match?.[1]?.trim()) setTitle(match[1].trim())
    }
  }

  function load() {
    fetch('/api/admin/templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTemplates(data.templates)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          description,
          html,
          isPremium,
          priceCents: isPremium ? Math.round(parseFloat(price || '0') * 100) : 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create template')
      setTitle('')
      setCategory('')
      setDescription('')
      setHtml('')
      setIsPremium(true)
      setPrice('49')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    setBusyId(id)
    await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
    load()
    setBusyId(null)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
          <ThemeToggle />
        </div>
        <h1 className="text-2xl font-bold mt-2">Templates</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Included free with any active plan — no purchase or per-template license required.
        </p>

        <form onSubmit={handleCreate} className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 space-y-3">
          <h2 className="text-sm font-semibold">Add a template</h2>
          <div className="grid grid-cols-2 gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Restaurant)" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm" />
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown in the gallery" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm" />
          <label className="inline-block px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold cursor-pointer text-slate-700 dark:text-zinc-200">
            Load from .html file
            <input type="file" accept=".html,.htm" onChange={handleFilePick} className="hidden" />
          </label>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Full HTML content (or load a file above)" required rows={6} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm font-mono" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
              <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} className="accent-[#f59e0b]" />
              Premium (requires a paid plan or individual purchase)
            </label>
            {isPremium && (
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
                Price ($)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
                />
              </label>
            )}
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50">
            {creating ? 'Adding…' : 'Add Template'}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {templates?.length === 0 && <p className="text-slate-500 dark:text-zinc-500 text-sm">No templates yet.</p>}
          {templates?.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">{t.category}</span>
                  {t.is_premium ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] font-semibold">${(t.price_cents / 100).toFixed(0)}</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">Free</span>
                  )}
                </div>
                <div className="font-semibold text-sm mt-0.5">{t.title}</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{t.description}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <a href={`/build/templates/${t.id}`} className="text-xs text-[#f59e0b] underline">Preview</a>
                <button onClick={() => handleDelete(t.id)} disabled={busyId === t.id} className="px-3 py-1.5 rounded-lg border border-red-400 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-semibold">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
