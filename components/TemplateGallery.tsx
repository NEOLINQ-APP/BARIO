'use client'

import { useEffect, useState } from 'react'
import TemplateThumbnail from '@/components/TemplateThumbnail'

type TemplateSummary = {
  id: string
  title: string
  category: string
  description: string
}

export default function TemplateGallery({ siteId }: { siteId: string | null }) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTemplates(data.templates)
      })
      .catch((err) => setError(err.message))
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (siteId) form.append('siteId', siteId)
      const res = await fetch('/api/sites/import-html', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to import HTML')
      window.location.href = `/build?site=${data.id}`
    } catch (err: any) {
      setUploadError(err.message)
      setUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href={`/build${siteId ? `?site=${siteId}` : ''}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Back to builder</a>
            <h1 className="text-2xl font-bold mt-2">Templates</h1>
            <p className="text-sm text-zinc-400 mt-1">Full custom designs, included free with your plan — pick one and start building.</p>
          </div>
          <label className="shrink-0 px-4 py-2.5 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200 cursor-pointer hover:border-zinc-600">
            {uploading ? 'Uploading…' : 'Upload your own HTML site'}
            <input type="file" accept=".html,.htm" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
        </div>

        {uploadError && <p className="text-red-400 text-sm mb-4">{uploadError}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!templates && !error && <p className="text-zinc-500 text-sm">Loading…</p>}
        {templates?.length === 0 && <p className="text-zinc-500 text-sm">No templates available yet — check back soon.</p>}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((t) => (
            <a
              key={t.id}
              href={`/build/templates/${t.id}${siteId ? `?site=${siteId}` : ''}`}
              className="block rounded-2xl border border-zinc-800 bg-[#131b2a] p-4 hover:border-zinc-600 transition-colors"
            >
              <TemplateThumbnail templateId={t.id} title={t.title} />
              <div className="text-xs uppercase tracking-wide text-zinc-500 mt-3">{t.category}</div>
              <h3 className="text-lg font-semibold mt-1">{t.title}</h3>
              <p className="text-sm text-zinc-400 mt-2">{t.description}</p>
              <div className="mt-4 text-sm font-semibold text-[#f59e0b]">Preview & use →</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
