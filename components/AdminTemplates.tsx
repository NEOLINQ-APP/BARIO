'use client'

import { useEffect, useState } from 'react'

type Template = {
  id: string
  title: string
  category: string
  description: string
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
        body: JSON.stringify({ title, category, description, html }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create template')
      setTitle('')
      setCategory('')
      setDescription('')
      setHtml('')
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
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <a href="/admin" className="text-sm text-zinc-400 hover:text-zinc-200">← Admin</a>
        <h1 className="text-2xl font-bold mt-2">Templates</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Included free with any active plan — no purchase or per-template license required.
        </p>

        <form onSubmit={handleCreate} className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 space-y-3">
          <h2 className="text-sm font-semibold">Add a template</h2>
          <div className="grid grid-cols-2 gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Restaurant)" className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown in the gallery" className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Full HTML content" required rows={6} className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm font-mono" />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50">
            {creating ? 'Adding…' : 'Add Template'}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {templates?.length === 0 && <p className="text-zinc-500 text-sm">No templates yet.</p>}
          {templates?.map((t) => (
            <div key={t.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">{t.category}</div>
                <div className="font-semibold text-sm mt-0.5">{t.title}</div>
                <div className="text-xs text-zinc-400 mt-1">{t.description}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <a href={`/build/templates/${t.id}`} className="text-xs text-[#f59e0b] underline">Preview</a>
                <button onClick={() => handleDelete(t.id)} disabled={busyId === t.id} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs font-semibold">
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
