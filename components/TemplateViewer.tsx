'use client'

import { useEffect, useState } from 'react'

type TemplateDetail = {
  id: string
  title: string
  category: string
  description: string
  html: string
}

export default function TemplateViewer({ templateId, siteId }: { templateId: string; siteId: string | null }) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usingTemplate, setUsingTemplate] = useState(false)

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTemplate(data)
      })
      .catch((err) => setError(err.message))
  }, [templateId])

  function handleExport() {
    window.location.href = `/api/templates/${templateId}/export`
  }

  function handleFullPreview() {
    if (!template) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open()
    win.document.write(template.html)
    win.document.close()
  }

  async function handleUseTemplate() {
    setUsingTemplate(true)
    setError(null)
    try {
      const res = await fetch('/api/sites/use-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId, siteId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to use template')
      window.location.href = `/build${siteId ? `?site=${siteId}` : ''}`
    } catch (err: any) {
      setError(err.message)
      setUsingTemplate(false)
    }
  }

  if (error) return <main className="min-h-screen bg-[#0b111c] text-red-400 p-10">{error}</main>
  if (!template) return <main className="min-h-screen bg-[#0b111c] text-zinc-400 p-10">Loading…</main>

  return (
    <main className="h-screen flex flex-col bg-[#0b111c] text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-zinc-800 flex-shrink-0">
        <a href={`/build/templates${siteId ? `?site=${siteId}` : ''}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Templates</a>
        <div>
          <div className="text-sm font-semibold">{template.title}</div>
          <div className="text-xs text-zinc-500">{template.category}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button onClick={handleFullPreview} className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200">
            Open Full Preview ↗
          </button>
          <button onClick={handleExport} className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200">
            Export HTML
          </button>
          <button onClick={handleUseTemplate} disabled={usingTemplate} className="px-4 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-60">
            {usingTemplate ? 'Loading…' : 'Use This Template'}
          </button>
        </div>
      </div>

      <div className="bg-blue-500/10 border-b border-blue-500/20 text-blue-300 text-xs px-5 py-2">
        This is a live preview — nothing is saved yet. Click "Use This Template" to start editing and publishing it as your site.
      </div>

      <iframe srcDoc={template.html} className="flex-1 w-full bg-white" title={template.title} />
    </main>
  )
}
